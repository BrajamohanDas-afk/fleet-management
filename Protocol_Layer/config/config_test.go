package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Clear any env vars that might be set
	os.Unsetenv("REDIS_ADDR")
	os.Unsetenv("MEDIAMTX_RTSP_URL")
	os.Unsetenv("PORT")
	os.Unsetenv("HTTP_RELAY_PORT")

	cfg := Load()

	if cfg.RedisAddr != "localhost:6379" {
		t.Errorf("expected default RedisAddr 'localhost:6379', got '%s'", cfg.RedisAddr)
	}
	if cfg.MediaMTXRTSPURL != "rtsp://localhost:8554" {
		t.Errorf("expected default MediaMTXRTSPURL 'rtsp://localhost:8554', got '%s'", cfg.MediaMTXRTSPURL)
	}
	if cfg.Port != "9000" {
		t.Errorf("expected default Port '9000', got '%s'", cfg.Port)
	}
	if cfg.HTTPRelayPort != "9100" {
		t.Errorf("expected default HTTPRelayPort '9100', got '%s'", cfg.HTTPRelayPort)
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("REDIS_ADDR", "redis-prod:6380")
	os.Setenv("MEDIAMTX_RTSP_URL", "rtsp://media:9554")
	os.Setenv("PORT", "8080")
	os.Setenv("HTTP_RELAY_PORT", "9191")
	defer func() {
		os.Unsetenv("REDIS_ADDR")
		os.Unsetenv("MEDIAMTX_RTSP_URL")
		os.Unsetenv("PORT")
		os.Unsetenv("HTTP_RELAY_PORT")
	}()

	cfg := Load()

	if cfg.RedisAddr != "redis-prod:6380" {
		t.Errorf("expected RedisAddr 'redis-prod:6380', got '%s'", cfg.RedisAddr)
	}
	if cfg.MediaMTXRTSPURL != "rtsp://media:9554" {
		t.Errorf("expected MediaMTXRTSPURL 'rtsp://media:9554', got '%s'", cfg.MediaMTXRTSPURL)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected Port '8080', got '%s'", cfg.Port)
	}
	if cfg.HTTPRelayPort != "9191" {
		t.Errorf("expected HTTPRelayPort '9191', got '%s'", cfg.HTTPRelayPort)
	}
}

func TestLoadPartialOverride(t *testing.T) {
	os.Setenv("REDIS_ADDR", "custom-redis:6379")
	os.Unsetenv("MEDIAMTX_RTSP_URL")
	os.Unsetenv("PORT")
	os.Unsetenv("HTTP_RELAY_PORT")
	defer os.Unsetenv("REDIS_ADDR")

	cfg := Load()

	if cfg.RedisAddr != "custom-redis:6379" {
		t.Errorf("expected RedisAddr 'custom-redis:6379', got '%s'", cfg.RedisAddr)
	}
	if cfg.MediaMTXRTSPURL != "rtsp://localhost:8554" {
		t.Errorf("expected default MediaMTXRTSPURL, got '%s'", cfg.MediaMTXRTSPURL)
	}
	if cfg.Port != "9000" {
		t.Errorf("expected default Port, got '%s'", cfg.Port)
	}
	if cfg.HTTPRelayPort != "9100" {
		t.Errorf("expected default HTTPRelayPort, got '%s'", cfg.HTTPRelayPort)
	}
}
