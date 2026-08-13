package redisclient

import (
	"context"
	"encoding/json"

	"protocol-layer/types"
)

// PublishStreamEvent publishes a stream status event to the
// "stream.events" Redis pub/sub channel.
// This method implements the types.StreamEventPublisher interface.
func (c *Client) PublishStreamEvent(
	ctx context.Context,
	event types.StreamEvent,
) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return c.RDB.Publish(
		ctx,
		"stream.events",
		data,
	).Err()
}