package gps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"protocol-layer/publisher"
	"protocol-layer/telemetry"
)

const DeviceStatusChannel = "protocol.device_status"

type FeedConfig struct {
	DeviceID     string `json:"device_id"`
	DeviceSerial string `json:"device_serial"`
	VehicleID    int    `json:"vehicle_id"`
	URL          string `json:"url"`
	Enabled      bool   `json:"enabled"`
}

type configCommand struct {
	Action   string      `json:"action"`
	DeviceID string      `json:"device_id"`
	Feed     *FeedConfig `json:"feed"`
}

type Manager struct {
	redis       *goredis.Client
	publisher   *publisher.TelemetryPublisher
	feedsKey    string
	feedsChan   string
	httpClient  *http.Client
	mu          sync.Mutex
	cancelByKey map[string]context.CancelFunc
}

func NewManager(redis *goredis.Client, telemetryPublisher *publisher.TelemetryPublisher, feedsKey string, feedsChan string) *Manager {
	return &Manager{
		redis:     redis,
		publisher: telemetryPublisher,
		feedsKey:  feedsKey,
		feedsChan: feedsChan,
		httpClient: &http.Client{
			Timeout: 3 * time.Second,
		},
		cancelByKey: make(map[string]context.CancelFunc),
	}
}

func (m *Manager) Run(ctx context.Context) error {
	if err := m.loadExisting(ctx); err != nil {
		return err
	}

	pubsub := m.redis.Subscribe(ctx, m.feedsChan)
	defer pubsub.Close()

	for {
		msg, err := pubsub.ReceiveMessage(ctx)
		if err != nil {
			return err
		}

		var command configCommand
		if err := json.Unmarshal([]byte(msg.Payload), &command); err != nil {
			log.Printf("invalid GPS feed command: %v", err)
			continue
		}

		switch command.Action {
		case "upsert":
			if command.Feed == nil {
				continue
			}
			m.upsert(ctx, *command.Feed)
		case "delete":
			m.remove(command.DeviceID)
		}
	}
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, cancel := range m.cancelByKey {
		cancel()
		delete(m.cancelByKey, key)
	}
}

func (m *Manager) loadExisting(ctx context.Context) error {
	items, err := m.redis.HGetAll(ctx, m.feedsKey).Result()
	if err != nil {
		return err
	}
	for _, raw := range items {
		var feed FeedConfig
		if err := json.Unmarshal([]byte(raw), &feed); err != nil {
			log.Printf("invalid GPS feed config: %v", err)
			continue
		}
		m.upsert(ctx, feed)
	}
	return nil
}

func feedKey(feed FeedConfig) string {
	if feed.DeviceID != "" {
		return feed.DeviceID
	}
	return feed.DeviceSerial
}

func (m *Manager) upsert(parent context.Context, feed FeedConfig) {
	key := feedKey(feed)
	if key == "" || feed.URL == "" || !feed.Enabled {
		m.remove(key)
		return
	}

	m.mu.Lock()
	if cancel, ok := m.cancelByKey[key]; ok {
		cancel()
	}
	ctx, cancel := context.WithCancel(parent)
	m.cancelByKey[key] = cancel
	m.mu.Unlock()

	go m.poll(ctx, key, feed)
}

func (m *Manager) remove(key string) {
	if key == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if cancel, ok := m.cancelByKey[key]; ok {
		cancel()
		delete(m.cancelByKey, key)
	}
}

func (m *Manager) poll(ctx context.Context, key string, feed FeedConfig) {
	backoff := time.Second
	for {
		t, status, err := m.fetch(feed)
		if err != nil {
			log.Printf("GPS feed %s error: %v", key, err)
			_ = m.publishStatus(ctx, key, "unavailable")
			if !sleep(ctx, backoff) {
				return
			}
			backoff = minDuration(backoff*2, 30*time.Second)
			continue
		}

		backoff = time.Second
		if status != "" {
			_ = m.publishStatus(ctx, key, status)
		}
		if t != nil {
			if err := m.publisher.Publish(ctx, t); err != nil {
				log.Printf("GPS feed %s telemetry publish error: %v", key, err)
			}
		}
		if !sleep(ctx, time.Second) {
			return
		}
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (m *Manager) publishStatus(ctx context.Context, deviceID string, status string) error {
	payload, err := json.Marshal(map[string]string{
		"device_id": deviceID,
		"status":    status,
	})
	if err != nil {
		return err
	}
	return m.redis.Publish(ctx, DeviceStatusChannel, payload).Err()
}

func (m *Manager) fetch(feed FeedConfig) (*telemetry.Telemetry, string, error) {
	req, err := http.NewRequest(http.MethodGet, feed.URL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "fleet-protocol-gps-poller")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, "", err
	}

	parsed, err := parseHTTPJSON(body)
	if err != nil {
		return nil, "", err
	}
	if !parsed.ValidFix {
		return nil, "waiting_for_fix", nil
	}

	return &telemetry.Telemetry{
		VehicleID: fmt.Sprint(feed.VehicleID),
		DeviceID:  feedKey(feed),
		Timestamp: parsed.Timestamp,
		Latitude:  parsed.Latitude,
		Longitude: parsed.Longitude,
		SpeedKmh:  parsed.SpeedKmh,
	}, "connected", nil
}

type parsedPoint struct {
	ValidFix  bool
	Timestamp time.Time
	Latitude  float64
	Longitude float64
	SpeedKmh  float64
}

type gpsPayload struct {
	GPSTime    string   `json:"gps_time"`
	Lat        *float64 `json:"lat"`
	Lon        *float64 `json:"lon"`
	Latitude   *float64 `json:"latitude"`
	Longitude  *float64 `json:"longitude"`
	Mode       int      `json:"mode"`
	ReceivedAt *float64 `json:"received_at"`
	SpeedKmh   *float64 `json:"speed_kmh"`
}

func parseHTTPJSON(body []byte) (parsedPoint, error) {
	var payload gpsPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return parsedPoint{}, err
	}

	lat := firstFloat(payload.Lat, payload.Latitude)
	lon := firstFloat(payload.Lon, payload.Longitude)
	if payload.Mode < 2 || lat == nil || lon == nil || !validCoordinate(*lat, *lon) {
		return parsedPoint{ValidFix: false}, nil
	}

	speed := 0.0
	if payload.SpeedKmh != nil && isFinite(*payload.SpeedKmh) && *payload.SpeedKmh >= 0 {
		speed = *payload.SpeedKmh
	}

	return parsedPoint{
		ValidFix:  true,
		Timestamp: timestamp(payload),
		Latitude:  *lat,
		Longitude: *lon,
		SpeedKmh:  speed,
	}, nil
}

func firstFloat(values ...*float64) *float64 {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func validCoordinate(lat float64, lon float64) bool {
	return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func timestamp(payload gpsPayload) time.Time {
	if payload.GPSTime != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, payload.GPSTime); err == nil {
			return parsed
		}
	}
	if payload.ReceivedAt != nil && *payload.ReceivedAt > 0 {
		sec, frac := math.Modf(*payload.ReceivedAt)
		return time.Unix(int64(sec), int64(frac*1e9)).UTC()
	}
	return time.Now().UTC()
}

func minDuration(a time.Duration, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
