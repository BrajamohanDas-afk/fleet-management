package protocol

import "protocol-layer/telemetry"

// Parser defines the contract for decoding raw binary or text
// byte frames into structured telemetry data.
type Parser interface {
	Parse(data []byte) (*telemetry.Telemetry, error)
}