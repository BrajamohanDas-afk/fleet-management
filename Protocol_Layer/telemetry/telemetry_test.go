package telemetry

import (
	"encoding/json"
	"testing"
	"time"
)

func TestTelemetryJSONRoundTrip(t *testing.T) {
	original := Telemetry{
		VehicleID: "vehicle-001",
		DeviceID:  "device-abc",
		Timestamp: time.Date(2026, 8, 12, 10, 30, 0, 0, time.UTC),
		Latitude:  17.4486,
		Longitude: 78.3741,
		SpeedKmh:  42.5,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var decoded Telemetry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if decoded.VehicleID != original.VehicleID {
		t.Errorf("VehicleID mismatch: got '%s', want '%s'", decoded.VehicleID, original.VehicleID)
	}
	if decoded.DeviceID != original.DeviceID {
		t.Errorf("DeviceID mismatch: got '%s', want '%s'", decoded.DeviceID, original.DeviceID)
	}
	if !decoded.Timestamp.Equal(original.Timestamp) {
		t.Errorf("Timestamp mismatch: got '%v', want '%v'", decoded.Timestamp, original.Timestamp)
	}
	if decoded.Latitude != original.Latitude {
		t.Errorf("Latitude mismatch: got %f, want %f", decoded.Latitude, original.Latitude)
	}
	if decoded.Longitude != original.Longitude {
		t.Errorf("Longitude mismatch: got %f, want %f", decoded.Longitude, original.Longitude)
	}
	if decoded.SpeedKmh != original.SpeedKmh {
		t.Errorf("SpeedKmh mismatch: got %f, want %f", decoded.SpeedKmh, original.SpeedKmh)
	}
}

func TestTelemetryJSONFieldNames(t *testing.T) {
	tel := Telemetry{
		VehicleID: "v1",
		DeviceID:  "d1",
		Latitude:  1.0,
		Longitude: 2.0,
		SpeedKmh:  10.0,
	}

	data, err := json.Marshal(tel)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("Unmarshal to map failed: %v", err)
	}

	expectedFields := []string{"vehicle_id", "device_id", "timestamp", "latitude", "longitude", "speed_kmh"}
	for _, field := range expectedFields {
		if _, ok := raw[field]; !ok {
			t.Errorf("expected JSON field '%s' not found in output", field)
		}
	}
}

func TestTelemetryZeroValue(t *testing.T) {
	var tel Telemetry

	data, err := json.Marshal(tel)
	if err != nil {
		t.Fatalf("Marshal of zero value failed: %v", err)
	}

	var decoded Telemetry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal of zero value failed: %v", err)
	}

	if decoded.VehicleID != "" {
		t.Errorf("expected empty VehicleID, got '%s'", decoded.VehicleID)
	}
	if decoded.SpeedKmh != 0 {
		t.Errorf("expected zero SpeedKmh, got %f", decoded.SpeedKmh)
	}
}
