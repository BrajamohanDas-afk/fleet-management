package stream

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"protocol-layer/types"
)

// mockPublisher implements types.StreamEventPublisher for testing.
type mockPublisher struct {
	mu     sync.Mutex
	events []types.StreamEvent
}

func (m *mockPublisher) PublishStreamEvent(ctx context.Context, event types.StreamEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
	return nil
}

func (m *mockPublisher) getEvents() []types.StreamEvent {
	m.mu.Lock()
	defer m.mu.Unlock()
	copy := make([]types.StreamEvent, len(m.events))
	for i, e := range m.events {
		copy[i] = e
	}
	return copy
}

func TestNewManager(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	if m == nil {
		t.Fatal("NewManager returned nil")
	}
	if m.ActiveStreams() != 0 {
		t.Errorf("expected 0 active streams, got %d", m.ActiveStreams())
	}
}

func TestManagerStartCreatesStream(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	s, err := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if s.ID != "vehicle-001-channel-1" {
		t.Errorf("unexpected stream ID: %s", s.ID)
	}
	if s.VehicleID != "vehicle-001" {
		t.Errorf("unexpected VehicleID: %s", s.VehicleID)
	}
	if s.Channel != 1 {
		t.Errorf("unexpected Channel: %d", s.Channel)
	}
	if s.InputURL != "rtsp://10.0.0.1:554/ch1" {
		t.Errorf("unexpected InputURL: %s", s.InputURL)
	}
	if s.OutputPath != "vehicles/vehicle-001/channel/1" {
		t.Errorf("unexpected OutputPath: %s", s.OutputPath)
	}
	if s.Status != "starting" {
		t.Errorf("unexpected initial Status: %s", s.Status)
	}
	if m.ActiveStreams() != 1 {
		t.Errorf("expected 1 active stream, got %d", m.ActiveStreams())
	}
}

func TestManagerStartPreventsDuplicates(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	s1, _ := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")
	s2, _ := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")

	if s1.ID != s2.ID {
		t.Error("expected same stream returned for duplicate start")
	}
	if m.ActiveStreams() != 1 {
		t.Errorf("expected 1 active stream after duplicate start, got %d", m.ActiveStreams())
	}
}

func TestManagerStartRequiresRTSPURL(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	_, err := m.Start("vehicle-001", 1, "")
	if err == nil {
		t.Error("expected error when rtsp_url is empty")
	}
}

func TestManagerStopRemovesStream(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	s, _ := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")

	err := m.Stop(s.ID)
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if m.ActiveStreams() != 0 {
		t.Errorf("expected 0 active streams after stop, got %d", m.ActiveStreams())
	}
}

func TestManagerStopNonexistent(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	err := m.Stop("nonexistent-stream")
	if err == nil {
		t.Error("expected error when stopping nonexistent stream")
	}
}

func TestManagerStopAll(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	m.Start("v1", 1, "rtsp://10.0.0.1:554/ch1")
	m.Start("v1", 2, "rtsp://10.0.0.1:554/ch2")
	m.Start("v2", 1, "rtsp://10.0.0.2:554/ch1")

	if m.ActiveStreams() != 3 {
		t.Fatalf("expected 3 active streams, got %d", m.ActiveStreams())
	}

	m.StopAll()

	if m.ActiveStreams() != 0 {
		t.Errorf("expected 0 active streams after StopAll, got %d", m.ActiveStreams())
	}
}

func TestManagerGetStream(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	s, _ := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")

	found, ok := m.GetStream(s.ID)
	if !ok {
		t.Fatal("GetStream returned false for existing stream")
	}
	if found.ID != s.ID {
		t.Errorf("GetStream returned wrong stream: got %s, want %s", found.ID, s.ID)
	}

	_, ok = m.GetStream("nonexistent")
	if ok {
		t.Error("GetStream should return false for nonexistent stream")
	}
}

func TestManagerConcurrentStartStop(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	var wg sync.WaitGroup
	var errCount atomic.Int32

	// Start 20 streams concurrently
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			_, err := m.Start(
				"vehicle-001",
				id,
				"rtsp://10.0.0.1:554/test",
			)
			if err != nil {
				errCount.Add(1)
			}
		}(i)
	}

	wg.Wait()

	if errCount.Load() > 0 {
		t.Errorf("%d errors during concurrent start", errCount.Load())
	}

	if m.ActiveStreams() != 20 {
		t.Errorf("expected 20 active streams, got %d", m.ActiveStreams())
	}

	// Stop all concurrently
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			streamID := "vehicle-001-channel-" + fmt.Sprintf("%d", id)
			m.Stop(streamID)
		}(i)
	}

	wg.Wait()

	if m.ActiveStreams() != 0 {
		t.Errorf("expected 0 active streams after concurrent stop, got %d", m.ActiveStreams())
	}
}

// Verify Manager implements StreamCommandHandler
func TestManagerImplementsStreamCommandHandler(t *testing.T) {
	var _ types.StreamCommandHandler = (*Manager)(nil)
}

func TestManagerRestartReplacesStream(t *testing.T) {
	pub := &mockPublisher{}
	m := NewManager("rtsp://localhost:8554", pub)

	s1, err := m.Start("vehicle-001", 1, "rtsp://10.0.0.1:554/ch1")
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	s2, err := m.Restart("vehicle-001", 1, "rtsp://user:pass@10.0.0.2:554/ch1")
	if err != nil {
		t.Fatalf("Restart failed: %v", err)
	}

	if s1.ID != s2.ID {
		t.Errorf("Restart changed stream ID: got %s, want %s", s2.ID, s1.ID)
	}
	if s2.InputURL != "rtsp://user:pass@10.0.0.2:554/ch1" {
		t.Errorf("Restart did not keep new RTSP URL: %s", s2.InputURL)
	}
	if m.ActiveStreams() != 1 {
		t.Errorf("expected 1 active stream after restart, got %d", m.ActiveStreams())
	}
}
