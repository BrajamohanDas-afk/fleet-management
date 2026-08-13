package telemetry

import "time"


type Telemetry struct {
	VehicleID  string    `json:"vehicle_id"`
    DeviceID   string    `json:"device_id"`
    Timestamp  time.Time `json:"timestamp"`
    Latitude   float64   `json:"latitude"`
    Longitude  float64   `json:"longitude"`
    SpeedKmh   float64   `json:"speed_kmh"`
}