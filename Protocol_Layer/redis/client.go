package redisclient

import (
	"context"

	goredis "github.com/redis/go-redis/v9"
)

// Client wraps the go-redis client for fleet management operations.
type Client struct {
	RDB *goredis.Client
}

// New creates a new Redis client connected to the given address.
func New(addr string) *Client {
	return &Client{
		RDB: goredis.NewClient(&goredis.Options{
			Addr: addr,
		}),
	}
}

// Ping verifies the Redis connection is alive.
func (c *Client) Ping(ctx context.Context) error {
	return c.RDB.Ping(ctx).Err()
}

// Close shuts down the Redis connection pool.
func (c *Client) Close() error {
	return c.RDB.Close()
}