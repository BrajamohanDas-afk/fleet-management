package stream

import (
	"context"
	"fmt"
	"sync"

	"protocol-layer/types"
)

// streamEntry holds a stream and its cancellation function.
type streamEntry struct {
	stream *types.Stream
	cancel context.CancelFunc
}

// Manager manages active video stream relay sessions.
// It is safe for concurrent use.
type Manager struct {
	mediaMTXURL string
	publisher   types.StreamEventPublisher

	streams map[string]*streamEntry
	mu      sync.RWMutex
}

// NewManager creates a new stream manager.
func NewManager(
	mediaMTXURL string,
	publisher types.StreamEventPublisher,
) *Manager {
	return &Manager{
		mediaMTXURL: mediaMTXURL,
		publisher:   publisher,
		streams:     make(map[string]*streamEntry),
	}
}

// Start begins a new stream relay for the given vehicle and channel.
// If a stream with the same ID already exists, it returns the existing one.
// This method implements types.StreamCommandHandler.
func (m *Manager) Start(
	vehicleID string,
	channel int,
	rtspURL string,
) (*types.Stream, error) {
	if rtspURL == "" {
		return nil, fmt.Errorf("rtsp_url is required")
	}

	streamID := types.BuildStreamID(vehicleID, channel)
	outputPath := fmt.Sprintf("vehicles/%s/channel/%d", vehicleID, channel)

	m.mu.Lock()
	defer m.mu.Unlock()

	if existing, ok := m.streams[streamID]; ok {
		if existing.stream.Status != "offline" && existing.stream.Status != "stopped" {
			return existing.stream, nil
		}
		existing.cancel()
		delete(m.streams, streamID)
	}

	ctx, cancel := context.WithCancel(context.Background())

	s := &types.Stream{
		ID:         streamID,
		VehicleID:  vehicleID,
		Channel:    channel,
		InputURL:   rtspURL,
		OutputPath: outputPath,
		Status:     "starting",
	}

	m.streams[streamID] = &streamEntry{
		stream: s,
		cancel: cancel,
	}

	go m.runRelay(ctx, s)

	return s, nil
}

// Restart replaces an active relay for a vehicle channel with a new RTSP URL.
// This method implements types.StreamCommandHandler.
func (m *Manager) Restart(
	vehicleID string,
	channel int,
	rtspURL string,
) (*types.Stream, error) {
	if rtspURL == "" {
		return nil, fmt.Errorf("rtsp_url is required")
	}

	streamID := types.BuildStreamID(vehicleID, channel)
	m.mu.Lock()
	if existing, ok := m.streams[streamID]; ok {
		existing.cancel()
		delete(m.streams, streamID)
	}
	m.mu.Unlock()

	return m.Start(vehicleID, channel, rtspURL)
}

// Stop terminates an active stream by its ID.
// It cancels the FFmpeg context to kill the child process.
// This method implements types.StreamCommandHandler.
func (m *Manager) Stop(streamID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, ok := m.streams[streamID]
	if !ok {
		return fmt.Errorf("stream not found: %s", streamID)
	}

	entry.cancel()
	delete(m.streams, streamID)

	return nil
}

// StopAll terminates all active streams. Used during graceful shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, entry := range m.streams {
		entry.cancel()
		delete(m.streams, id)
	}
}

// GetStream returns a stream by its ID, or false if not found.
func (m *Manager) GetStream(streamID string) (*types.Stream, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	entry, ok := m.streams[streamID]
	if !ok {
		return nil, false
	}
	return entry.stream, true
}

// ActiveStreams returns the count of currently active streams.
func (m *Manager) ActiveStreams() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.streams)
}
