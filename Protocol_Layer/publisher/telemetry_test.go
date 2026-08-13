package publisher

import (
	"encoding/json"
	"testing"
	"time"

	"protocol-layer/telemetry"
)

func TestTelemetryPublisherCreation(t *testing.T) {
	// Test that NewTelemetryPublisher doesn't panic with nil
	// (it just stores the reference)
	pub := NewTelemetryPublisher(nil)
	if pub == nil {
		t.Fatal("NewTelemetryPublisher returned nil")
	}
}

func TestTelemetryPayloadFormat(t *testing.T) {
	// Verify the JSON format matches what the backend expects
	tel := &telemetry.Telemetry{
		VehicleID: "vehicle-001",
		DeviceID:  "device-abc",
		Timestamp: time.Date(2026, 8, 12, 10, 30, 0, 0, time.UTC),
		Latitude:  17.4486,
		Longitude: 78.3741,
		SpeedKmh:  42.5,
	}

	data, err := json.Marshal(tel)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("Unmarshal to map failed: %v", err)
	}

	// Check the JSON keys match what the Python backend expects
	expectedKeys := []string{"vehicle_id", "device_id", "timestamp", "latitude", "longitude", "speed_kmh"}
	for _, key := range expectedKeys {
		if _, ok := raw[key]; !ok {
			t.Errorf("expected key '%s' not found in JSON output", key)
		}
	}

	// Verify specific values
	if raw["vehicle_id"] != "vehicle-001" {
		t.Errorf("vehicle_id: got '%v', want 'vehicle-001'", raw["vehicle_id"])
	}
	if raw["speed_kmh"].(float64) != 42.5 {
		t.Errorf("speed_kmh: got %v, want 42.5", raw["speed_kmh"])
	}
}

func TestTelemetryZeroValuePayload(t *testing.T) {
	// Ensure zero-value telemetry marshals without error
	tel := &telemetry.Telemetry{}

	data, err := json.Marshal(tel)
	if err != nil {
		t.Fatalf("Marshal of zero-value telemetry failed: %v", err)
	}

	if len(data) == 0 {
		t.Error("expected non-empty JSON output")
	}
}
