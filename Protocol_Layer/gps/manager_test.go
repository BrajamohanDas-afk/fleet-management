package gps

import (
	"testing"
	"time"
)

func TestParseHTTPJSONValidFixUsesGPSTime(t *testing.T) {
	point, err := parseHTTPJSON([]byte(`{"gps_time":"2026-08-21T07:20:26.000Z","lat":17.4486,"lon":78.3741,"mode":2,"received_at":1787296826.4720342,"speed_kmh":42.5}`))
	if err != nil {
		t.Fatalf("parseHTTPJSON failed: %v", err)
	}
	if !point.ValidFix {
		t.Fatal("expected a valid fix")
	}
	if point.Latitude != 17.4486 || point.Longitude != 78.3741 {
		t.Fatalf("coordinates mismatch: got %f,%f", point.Latitude, point.Longitude)
	}
	want := time.Date(2026, 8, 21, 7, 20, 26, 0, time.UTC)
	if !point.Timestamp.Equal(want) {
		t.Fatalf("timestamp mismatch: got %s, want %s", point.Timestamp, want)
	}
	if point.SpeedKmh != 42.5 {
		t.Fatalf("speed mismatch: got %f, want 42.5", point.SpeedKmh)
	}
}

func TestParseHTTPJSONRejectsNoFix(t *testing.T) {
	point, err := parseHTTPJSON([]byte(`{"gps_time":"2026-08-21T07:20:26.000Z","lat":null,"lon":null,"mode":1,"received_at":1787296826.4720342,"speed_kmh":null}`))
	if err != nil {
		t.Fatalf("parseHTTPJSON failed: %v", err)
	}
	if point.ValidFix {
		t.Fatal("expected mode 1/null coordinates to be suppressed")
	}
}
