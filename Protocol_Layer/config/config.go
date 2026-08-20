package config

import "os"

type Config struct {
	RedisAddr       string
	MediaMTXRTSPURL string
	Port            string
	HTTPRelayPort   string
}

func Load() Config {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	mediamtxURL := os.Getenv("MEDIAMTX_RTSP_URL")
	if mediamtxURL == "" {
		mediamtxURL = "rtsp://localhost:8554"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "9000"
	}

	httpRelayPort := os.Getenv("HTTP_RELAY_PORT")
	if httpRelayPort == "" {
		httpRelayPort = "9100"
	}

	return Config{
		RedisAddr:       redisAddr,
		MediaMTXRTSPURL: mediamtxURL,
		Port:            port,
		HTTPRelayPort:   httpRelayPort,
	}
}
