package types

import (
	"context"
	"fmt"
)

// Stream represents an active video stream relay session.
type Stream struct {
	ID         string
	VehicleID  string
	Channel    int
	InputURL   string
	OutputPath string
	Status     string
}

// StreamEvent is the JSON-serializable event published to Redis
// when a stream's status changes.
type StreamEvent struct {
	StreamID   string `json:"stream_id"`
	VehicleID  string `json:"vehicle_id"`
	Channel    int    `json:"channel"`
	Status     string `json:"status"`
	StreamPath string `json:"stream_path"`
}

func BuildStreamID(vehicleID string, channel int) string {
	return fmt.Sprintf("%s-channel-%d", vehicleID, channel)
}

// ToStreamEvent converts a Stream into a StreamEvent for publishing.
func ToStreamEvent(s *Stream) StreamEvent {
	return StreamEvent{
		StreamID:   s.ID,
		VehicleID:  s.VehicleID,
		Channel:    s.Channel,
		Status:     s.Status,
		StreamPath: s.OutputPath,
	}
}

// StreamEventPublisher publishes stream status change events.
// Implemented by the Redis client to break the circular dependency
// between redis/ and stream/ packages.
type StreamEventPublisher interface {
	PublishStreamEvent(ctx context.Context, event StreamEvent) error
}

// StreamCommandHandler processes stream start/stop commands.
// Implemented by stream.Manager to break the circular dependency
// between redis/ and stream/ packages.
type StreamCommandHandler interface {
	Start(vehicleID string, channel int, rtspURL string) (*Stream, error)
	Stop(streamID string) error
	Restart(vehicleID string, channel int, rtspURL string) (*Stream, error)
}
