package server

import (
	"bufio"
	"fmt"
	"net"
	"time"
)

const (
	maxMessageSize = 1024 * 1024
	// readTimeout is the maximum idle time before a connection
	// is considered hung and closed.
	readTimeout = 60 * time.Second
)

// Connection manages a single TCP device connection.
type Connection struct {
	conn    net.Conn
	handler MessageHandler
}

// NewConnection wraps a net.Conn with the given message handler.
func NewConnection(
	conn net.Conn,
	handler MessageHandler,
) *Connection {
	return &Connection{
		conn:    conn,
		handler: handler,
	}
}

// Handle reads newline-delimited messages. TCP is a byte stream, so framing
// prevents a JSON payload being split or two payloads being combined.
func (c *Connection) Handle() error {
	scanner := bufio.NewScanner(c.conn)
	scanner.Buffer(make([]byte, 4096), maxMessageSize)
	for {
		// Set read deadline to detect hung connections
		if err := c.conn.SetReadDeadline(time.Now().Add(readTimeout)); err != nil {
			return fmt.Errorf("set read deadline: %w", err)
		}
		if !scanner.Scan() {
			break
		}
		if c.handler != nil {
			if err := c.handler(c.conn, append([]byte(nil), scanner.Bytes()...)); err != nil {
				return fmt.Errorf("message handler: %w", err)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read from device: %w", err)
	}
	return nil
}
