package stream

import (
	"context"
	"fmt"
	"log"
	"os/exec"

	"protocol-layer/types"
)

// runRelay spawns an FFmpeg process to relay an RTSP stream from the
// vehicle's DVR to the MediaMTX server. It updates the stream status
// and publishes events as the state changes.
func (m *Manager) runRelay(ctx context.Context, s *types.Stream) {
	outputURL := fmt.Sprintf("%s/%s", m.mediaMTXURL, s.OutputPath)

	cmd := exec.CommandContext(
		ctx,
		"ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", s.InputURL,
		"-an",
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-tune", "zerolatency",
		"-profile:v", "baseline",
		"-pix_fmt", "yuv420p",
		"-g", "30",
		"-bf", "0",
		"-f", "rtsp",
		"-rtsp_transport", "tcp",
		outputURL,
	)

	if err := cmd.Start(); err != nil {
		log.Printf("FFmpeg start failed for stream %s: %v", s.ID, err)
		m.setStatus(s, "offline")
		return
	}

	m.setStatus(s, "live")

	err := cmd.Wait()

	if ctx.Err() != nil {
		// Context was cancelled — Stop() was called
		m.setStatus(s, "stopped")
	} else if err != nil {
		log.Printf("FFmpeg exited with error for stream %s: %v", s.ID, err)
		m.setStatus(s, "offline")
	} else {
		m.setStatus(s, "stopped")
	}
}

// setStatus updates the stream's status under lock and publishes
// a stream event to Redis.
func (m *Manager) setStatus(s *types.Stream, status string) {
	m.mu.Lock()
	s.Status = status
	m.mu.Unlock()

	event := types.ToStreamEvent(s)
	if err := m.publisher.PublishStreamEvent(context.Background(), event); err != nil {
		log.Printf("Failed to publish stream event for %s: %v", s.ID, err)
	}
}
