package redisclient

import (
	"encoding/json"
	"testing"

	"protocol-layer/types"
)

// TestStreamCommandSerialization tests that StreamCommand JSON
// serialization produces the expected format.
func TestStreamCommandSerialization(t *testing.T) {
	cmd := StreamCommand{
		Action:    "start",
		VehicleID: "vehicle-001",
		Channel:   1,
		RTSPURL:   "rtsp://10.0.0.1:554/ch1",
	}

	data, err := json.Marshal(cmd)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var decoded StreamCommand
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if decoded.Action != "start" {
		t.Errorf("Action: got '%s', want 'start'", decoded.Action)
	}
	if decoded.VehicleID != "vehicle-001" {
		t.Errorf("VehicleID: got '%s', want 'vehicle-001'", decoded.VehicleID)
	}
	if decoded.Channel != 1 {
		t.Errorf("Channel: got %d, want 1", decoded.Channel)
	}
	if decoded.RTSPURL != "rtsp://10.0.0.1:554/ch1" {
		t.Errorf("RTSPURL: got '%s', want 'rtsp://10.0.0.1:554/ch1'", decoded.RTSPURL)
	}
}

func TestStreamCommandStopSerialization(t *testing.T) {
	cmd := StreamCommand{
		Action:   "stop",
		StreamID: "vehicle-001-channel-1",
	}

	data, err := json.Marshal(cmd)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var raw map[string]interface{}
	json.Unmarshal(data, &raw)

	if raw["action"] != "stop" {
		t.Errorf("action: got '%v', want 'stop'", raw["action"])
	}
	if raw["stream_id"] != "vehicle-001-channel-1" {
		t.Errorf("stream_id: got '%v', want 'vehicle-001-channel-1'", raw["stream_id"])
	}

	// omitempty fields should not be present
	if _, ok := raw["vehicle_id"]; ok {
		t.Error("vehicle_id should be omitted when empty")
	}
}

func TestStreamCommandOmitEmpty(t *testing.T) {
	cmd := StreamCommand{
		Action: "start",
	}

	data, _ := json.Marshal(cmd)
	var raw map[string]interface{}
	json.Unmarshal(data, &raw)

	// Action should always be present
	if _, ok := raw["action"]; !ok {
		t.Error("action field should always be present")
	}

	// vehicle_id should be omitted when empty
	if _, ok := raw["vehicle_id"]; ok {
		t.Error("vehicle_id should be omitted when empty")
	}
}

func TestStreamEventSerialization(t *testing.T) {
	event := types.StreamEvent{
		StreamID:   "vehicle-001-channel-1",
		VehicleID:  "vehicle-001",
		Channel:    1,
		Status:     "live",
		StreamPath: "vehicles/vehicle-001/channel/1",
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var decoded types.StreamEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if decoded.StreamID != event.StreamID {
		t.Errorf("StreamID mismatch")
	}
	if decoded.Status != "live" {
		t.Errorf("Status: got '%s', want 'live'", decoded.Status)
	}
}

func TestToStreamEvent(t *testing.T) {
	s := &types.Stream{
		ID:         "vehicle-001-channel-1",
		VehicleID:  "vehicle-001",
		Channel:    1,
		InputURL:   "rtsp://10.0.0.1:554/ch1",
		OutputPath: "vehicles/vehicle-001/channel/1",
		Status:     "live",
	}

	event := types.ToStreamEvent(s)

	if event.StreamID != s.ID {
		t.Errorf("StreamID: got '%s', want '%s'", event.StreamID, s.ID)
	}
	if event.VehicleID != s.VehicleID {
		t.Errorf("VehicleID: got '%s', want '%s'", event.VehicleID, s.VehicleID)
	}
	if event.Channel != s.Channel {
		t.Errorf("Channel: got %d, want %d", event.Channel, s.Channel)
	}
	if event.Status != s.Status {
		t.Errorf("Status: got '%s', want '%s'", event.Status, s.Status)
	}
	if event.StreamPath != s.OutputPath {
		t.Errorf("StreamPath: got '%s', want '%s'", event.StreamPath, s.OutputPath)
	}
}

func TestNewClient(t *testing.T) {
	client := New("localhost:6379")
	if client == nil {
		t.Fatal("New returned nil")
	}
	if client.RDB == nil {
		t.Fatal("RDB field is nil")
	}
	client.Close()
}

// TestClientImplementsStreamEventPublisher verifies the Client
// type satisfies the StreamEventPublisher interface at compile time.
func TestClientImplementsStreamEventPublisher(t *testing.T) {
	var _ types.StreamEventPublisher = (*Client)(nil)
}

func TestStreamCommandResolvedStreamIDFromVehicleChannel(t *testing.T) {
	cmd := StreamCommand{
		Action:    "stop",
		VehicleID: "vehicle-001",
		Channel:   2,
	}

	if got, want := cmd.resolvedStreamID(), types.BuildStreamID("vehicle-001", 2); got != want {
		t.Errorf("resolvedStreamID: got %s, want %s", got, want)
	}
}

func TestStreamCommandRestartPreservesRTSPURLWithAtPassword(t *testing.T) {
	url := "rtsp://admin:admin@123@172.17.104.71:554/cam/realmonitor?channel=1&subtype=0"
	cmd := StreamCommand{
		Action:    "restart",
		VehicleID: "vehicle-001",
		Channel:   1,
		RTSPURL:   url,
	}

	data, err := json.Marshal(cmd)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var decoded StreamCommand
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if decoded.RTSPURL != url {
		t.Errorf("RTSPURL: got %q, want %q", decoded.RTSPURL, url)
	}
}
