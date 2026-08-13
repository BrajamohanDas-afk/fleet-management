package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"protocol-layer/config"
	"protocol-layer/protocol"
	"protocol-layer/publisher"
	redisclient "protocol-layer/redis"
	"protocol-layer/server"
	"protocol-layer/stream"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Connect to Redis
	redis := redisclient.New(cfg.RedisAddr)
	defer redis.Close()

	if err := redis.Ping(ctx); err != nil {
		log.Fatal("Redis connection failed:", err)
	}

	log.Println("Redis connected")

	// Initialize stream manager with Redis as the event publisher
	manager := stream.NewManager(
		cfg.MediaMTXRTSPURL,
		redis,
	)
	telemetryPublisher := publisher.NewTelemetryPublisher(redis.RDB)
	telemetryParser := protocol.NewJSONParser()
	tcpServer := server.NewTCPServer(":"+cfg.Port, func(_ net.Conn, data []byte) error {
		telemetry, err := telemetryParser.Parse(data)
		if err != nil {
			return err
		}
		return telemetryPublisher.Publish(ctx, telemetry)
	})

	go func() {
		if err := tcpServer.Start(); err != nil && ctx.Err() == nil {
			log.Printf("telemetry TCP server error: %v", err)
		}
	}()

	// Start stream command consumer in a background goroutine
	go func() {
		log.Println("Waiting for stream commands...")
		if err := redis.ConsumeStreamCommands(ctx, manager); err != nil {
			if ctx.Err() == nil {
				log.Printf("Stream command consumer error: %v", err)
			}
		}
	}()

	// Block until a shutdown signal is received
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	// Cancel context to stop the Redis subscription consumer
	cancel()
	if err := tcpServer.Stop(); err != nil {
		log.Printf("telemetry TCP server stop error: %v", err)
	}

	// Stop all active streams (cancels FFmpeg processes)
	manager.StopAll()

	log.Println("Shutdown complete")
}
