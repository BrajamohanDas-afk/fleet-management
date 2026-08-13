package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"testing"
	"time"

	"protocol-layer/config"
	"protocol-layer/protocol"
	"protocol-layer/server"
	"protocol-layer/stream"
	"protocol-layer/telemetry"
	"protocol-layer/types"
)

// mockEventPublisher collects stream events for assertions.
type mockEventPublisher struct {
	mu     sync.Mutex
	events []types.StreamEvent
}

func (m *mockEventPublisher) PublishStreamEvent(ctx context.Context, event types.StreamEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
	return nil
}

func (m *mockEventPublisher) getEvents() []types.StreamEvent {
	m.mu.Lock()
	defer m.mu.Unlock()
	res := make([]types.StreamEvent, len(m.events))
	copy(res, m.events)
	return res
}

// --- Integration Tests ---

func TestIntegrationConfigLoad(t *testing.T) {
	cfg := config.Load()

	if cfg.RedisAddr == "" {
		t.Error("RedisAddr should not be empty")
	}
	if cfg.MediaMTXRTSPURL == "" {
		t.Error("MediaMTXRTSPURL should not be empty")
	}
	if cfg.Port == "" {
		t.Error("Port should not be empty")
	}
}

func TestIntegrationTelemetryPipeline(t *testing.T) {
	// Simulate: TCP client -> server -> parser -> validate
	parser := protocol.NewJSONParser()

	var receivedTelemetry *telemetry.Telemetry
	var mu sync.Mutex
	done := make(chan struct{})

	handler := func(conn net.Conn, data []byte) error {
		tel, err := parser.Parse(data)
		if err != nil {
			return err
		}

		mu.Lock()
		receivedTelemetry = tel
		mu.Unlock()
		close(done)
		return nil
	}

	// Start TCP server
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := l.Addr().String()
	l.Close()

	srv := server.NewTCPServer(addr, handler)
	go srv.Start()
	defer srv.Stop()

	time.Sleep(100 * time.Millisecond)

	// Simulate a vehicle sending telemetry
	tel := telemetry.Telemetry{
		VehicleID: "vehicle-integration-001",
		DeviceID:  "device-int-abc",
		Timestamp: time.Now().UTC(),
		Latitude:  17.4486,
		Longitude: 78.3741,
		SpeedKmh:  60.0,
	}

	data, _ := json.Marshal(tel)

	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}

	_, err = conn.Write(data)
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}
	conn.Close()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for telemetry to be processed")
	}

	mu.Lock()
	defer mu.Unlock()

	if receivedTelemetry == nil {
		t.Fatal("no telemetry received")
	}
	if receivedTelemetry.VehicleID != "vehicle-integration-001" {
		t.Errorf("VehicleID: got '%s', want 'vehicle-integration-001'", receivedTelemetry.VehicleID)
	}
	if receivedTelemetry.SpeedKmh != 60.0 {
		t.Errorf("SpeedKmh: got %f, want 60.0", receivedTelemetry.SpeedKmh)
	}
}

func TestIntegrationStreamManagerLifecycle(t *testing.T) {
	pub := &mockEventPublisher{}
	manager := stream.NewManager("rtsp://localhost:8554", pub)

	// Start multiple streams
	for i := 0; i < 3; i++ {
		_, err := manager.Start(
			"vehicle-int",
			i+1,
			fmt.Sprintf("rtsp://10.0.0.1:554/ch%d", i+1),
		)
		if err != nil {
			t.Fatalf("Start stream %d failed: %v", i+1, err)
		}
	}

	if manager.ActiveStreams() != 3 {
		t.Errorf("expected 3 active streams, got %d", manager.ActiveStreams())
	}

	// Stop one stream
	err := manager.Stop("vehicle-int-channel-2")
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if manager.ActiveStreams() != 2 {
		t.Errorf("expected 2 active streams after stop, got %d", manager.ActiveStreams())
	}

	// StopAll
	manager.StopAll()
	if manager.ActiveStreams() != 0 {
		t.Errorf("expected 0 active streams after StopAll, got %d", manager.ActiveStreams())
	}
}

func TestIntegrationStreamEventPublishing(t *testing.T) {
	s := &types.Stream{
		ID:         "vehicle-001-channel-1",
		VehicleID:  "vehicle-001",
		Channel:    1,
		OutputPath: "vehicles/vehicle-001/channel/1",
		Status:     "live",
	}

	event := types.ToStreamEvent(s)

	if event.StreamID != s.ID {
		t.Errorf("StreamID mismatch")
	}
	if event.Status != "live" {
		t.Errorf("Status mismatch")
	}

	// Verify event serializes correctly for Redis
	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var decoded types.StreamEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if decoded != event {
		t.Errorf("round-trip mismatch: got %+v, want %+v", decoded, event)
	}
}

func TestIntegrationTypesInterfaces(t *testing.T) {
	// Compile-time verification that our types satisfy interfaces
	var _ types.StreamCommandHandler = (*stream.Manager)(nil)
	var _ types.StreamEventPublisher = (*mockEventPublisher)(nil)
}
