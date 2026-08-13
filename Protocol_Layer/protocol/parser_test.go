package protocol

import (
	"encoding/json"
	"testing"
	"time"

	"protocol-layer/telemetry"
)

func TestJSONParserValidPayload(t *testing.T) {
	parser := NewJSONParser()

	payload := telemetry.Telemetry{
		VehicleID: "vehicle-001",
		DeviceID:  "device-abc",
		Timestamp: time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC),
		Latitude:  17.4486,
		Longitude: 78.3741,
		SpeedKmh:  55.0,
	}

	data, _ := json.Marshal(payload)

	result, err := parser.Parse(data)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if result.VehicleID != "vehicle-001" {
		t.Errorf("VehicleID: got '%s', want 'vehicle-001'", result.VehicleID)
	}
	if result.DeviceID != "device-abc" {
		t.Errorf("DeviceID: got '%s', want 'device-abc'", result.DeviceID)
	}
	if result.Latitude != 17.4486 {
		t.Errorf("Latitude: got %f, want 17.4486", result.Latitude)
	}
	if result.SpeedKmh != 55.0 {
		t.Errorf("SpeedKmh: got %f, want 55.0", result.SpeedKmh)
	}
}

func TestJSONParserMalformedInput(t *testing.T) {
	parser := NewJSONParser()

	_, err := parser.Parse([]byte("not valid json"))
	if err == nil {
		t.Error("expected error for malformed JSON, got nil")
	}
}

func TestJSONParserEmptyJSON(t *testing.T) {
	parser := NewJSONParser()

	_, err := parser.Parse([]byte("{}"))
	if err == nil {
		t.Error("expected error for empty JSON (missing required fields), got nil")
	}
}

func TestJSONParserMissingVehicleID(t *testing.T) {
	parser := NewJSONParser()

	data := []byte(`{"device_id": "d1", "latitude": 1.0, "longitude": 2.0}`)

	_, err := parser.Parse(data)
	if err == nil {
		t.Error("expected error for missing vehicle_id, got nil")
	}
}

func TestJSONParserMissingDeviceID(t *testing.T) {
	parser := NewJSONParser()

	data := []byte(`{"vehicle_id": "v1", "latitude": 1.0, "longitude": 2.0}`)

	_, err := parser.Parse(data)
	if err == nil {
		t.Error("expected error for missing device_id, got nil")
	}
}

func TestJSONParserEmptyBytes(t *testing.T) {
	parser := NewJSONParser()

	_, err := parser.Parse([]byte{})
	if err == nil {
		t.Error("expected error for empty bytes, got nil")
	}
}

func TestJSONParserImplementsInterface(t *testing.T) {
	// Compile-time check that JSONParser implements Parser
	var _ Parser = (*JSONParser)(nil)
}
