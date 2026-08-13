package redisclient

import (
	"context"
	"encoding/json"
	"fmt"

	"protocol-layer/types"
)

// StreamCommand represents a JSON command received from Redis pub/sub
// to start or stop a video stream.
type StreamCommand struct {
	Action    string `json:"action"`
	VehicleID string `json:"vehicle_id,omitempty"`
	Channel   int    `json:"channel,omitempty"`
	RTSPURL   string `json:"rtsp_url,omitempty"`
	StreamID  string `json:"stream_id,omitempty"`
}

func (cmd StreamCommand) resolvedStreamID() string {
	if cmd.StreamID != "" {
		return cmd.StreamID
	}
	if cmd.VehicleID != "" && cmd.Channel != 0 {
		return types.BuildStreamID(cmd.VehicleID, cmd.Channel)
	}
	return ""
}

// ConsumeStreamCommands subscribes to the "stream.commands" Redis channel
// and dispatches start/stop actions to the stream command handler.
func (c *Client) ConsumeStreamCommands(
	ctx context.Context,
	manager types.StreamCommandHandler,
) error {
	pubsub := c.RDB.Subscribe(ctx, "stream.commands")
	defer pubsub.Close()

	for {
		msg, err := pubsub.ReceiveMessage(ctx)
		if err != nil {
			return err
		}

		var cmd StreamCommand
		if err := json.Unmarshal([]byte(msg.Payload), &cmd); err != nil {
			fmt.Println("invalid stream command:", err)
			continue
		}

		switch cmd.Action {
		case "start":
			_, err := manager.Start(
				cmd.VehicleID,
				cmd.Channel,
				cmd.RTSPURL,
			)
			if err != nil {
				fmt.Println("start stream error:", err)
			}

		case "restart":
			_, err := manager.Restart(
				cmd.VehicleID,
				cmd.Channel,
				cmd.RTSPURL,
			)
			if err != nil {
				fmt.Println("restart stream error:", err)
			}

		case "stop":
			streamID := cmd.resolvedStreamID()
			if streamID == "" {
				fmt.Println("stop stream error: stream_id or vehicle_id/channel is required")
				continue
			}
			if err := manager.Stop(streamID); err != nil {
				fmt.Println("stop stream error:", err)
			}
		}
	}
}
