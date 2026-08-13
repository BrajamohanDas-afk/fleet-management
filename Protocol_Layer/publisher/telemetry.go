package publisher

import (
	"context"
	"encoding/json"

	goredis "github.com/redis/go-redis/v9"
	"protocol-layer/telemetry"
)

// TelemetryPublisher serializes Telemetry objects to JSON and
// publishes them to the "protocol.telemetry" Redis pub/sub channel.
type TelemetryPublisher struct {
	redis *goredis.Client
}

// NewTelemetryPublisher creates a new publisher using the given Redis client.
func NewTelemetryPublisher(redis *goredis.Client) *TelemetryPublisher {
	return &TelemetryPublisher{
		redis: redis,
	}
}

// Publish marshals the telemetry data to JSON and publishes it
// to the "protocol.telemetry" Redis channel.
func (p *TelemetryPublisher) Publish(
	ctx context.Context,
	t *telemetry.Telemetry,
) error {
	data, err := json.Marshal(t)
	if err != nil {
		return err
	}

	return p.redis.Publish(
		ctx,
		"protocol.telemetry",
		data,
	).Err()
}
