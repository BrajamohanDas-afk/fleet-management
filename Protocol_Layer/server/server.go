package server

import (
	"errors"
	"fmt"
	"log"
	"net"
	"sync"
)

// MessageHandler is a callback invoked for each chunk of data
// received from a connected device.
type MessageHandler func(conn net.Conn, data []byte) error

// TCPServer accepts TCP connections from vehicle IoT devices
// and dispatches incoming data to the configured handler.
type TCPServer struct {
	Address  string
	Handler  MessageHandler
	listener net.Listener
	wg       sync.WaitGroup
}

// NewTCPServer creates a new TCP server bound to the given address.
func NewTCPServer(address string, handler MessageHandler) *TCPServer {
	return &TCPServer{
		Address: address,
		Handler: handler,
	}
}

// Start begins listening for TCP connections. This blocks until
// the listener is closed.
func (s *TCPServer) Start() error {
	listener, err := net.Listen("tcp", s.Address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", s.Address, err)
	}

	s.listener = listener

	log.Printf("TCP server listening on %s", s.Address)

	for {
		conn, err := listener.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			log.Printf("accept connection error: %v", err)
			continue
		}

		s.wg.Add(1)

		go func() {
			defer s.wg.Done()
			s.handleConnection(conn)
		}()
	}
}

// handleConnection processes a single device connection.
func (s *TCPServer) handleConnection(conn net.Conn) {
	defer conn.Close()

	log.Printf("device connected: %s", conn.RemoteAddr())

	connection := NewConnection(conn, s.Handler)

	if err := connection.Handle(); err != nil {
		log.Printf(
			"device %s disconnected: %v",
			conn.RemoteAddr(),
			err,
		)
	}

	log.Printf("device disconnected: %s", conn.RemoteAddr())
}

// Stop closes the TCP listener and waits for active connections
// to finish processing.
func (s *TCPServer) Stop() error {
	if s.listener != nil {
		err := s.listener.Close()
		s.wg.Wait()
		return err
	}

	return nil
}
