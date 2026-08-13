package protocol

import (
	"encoding/json"
	"fmt"

	"protocol-layer/telemetry"
)

// JSONParser is a reference implementation of the Parser interface
// that decodes JSON-encoded telemetry payloads.
type JSONParser struct{}

// NewJSONParser creates a new JSONParser.
func NewJSONParser() *JSONParser {
	return &JSONParser{}
}

// Parse decodes a JSON byte slice into a Telemetry struct.
// It validates that required fields (VehicleID, DeviceID) are present.
func (p *JSONParser) Parse(data []byte) (*telemetry.Telemetry, error) {
	var t telemetry.Telemetry
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("json parse: %w", err)
	}

	if t.VehicleID == "" {
		return nil, fmt.Errorf("vehicle_id is required")
	}

	if t.DeviceID == "" {
		return nil, fmt.Errorf("device_id is required")
	}

	return &t, nil
}
