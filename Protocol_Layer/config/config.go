package config

import "os"

type Config struct {
	RedisAddr        string
	MediaMTXRTSPURL string
	Port             string
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

	return Config{
		RedisAddr:        redisAddr,
		MediaMTXRTSPURL: mediamtxURL,
		Port:             port,
	}
}