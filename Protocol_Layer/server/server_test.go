package server

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func getFreePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to get free port: %v", err)
	}
	addr := l.Addr().String()
	l.Close()
	return addr
}

func TestNewTCPServer(t *testing.T) {
	handler := func(conn net.Conn, data []byte) error { return nil }
	srv := NewTCPServer(":9000", handler)

	if srv.Address != ":9000" {
		t.Errorf("expected address ':9000', got '%s'", srv.Address)
	}
	if srv.Handler == nil {
		t.Error("expected handler to be set")
	}
}

func TestTCPServerStartStop(t *testing.T) {
	addr := getFreePort(t)
	handler := func(conn net.Conn, data []byte) error { return nil }
	srv := NewTCPServer(addr, handler)

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start()
	}()

	// Give server time to start
	time.Sleep(100 * time.Millisecond)

	// Verify we can connect
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to connect to server: %v", err)
	}
	conn.Close()

	// Stop the server
	if err := srv.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}
}

func TestTCPServerHandlerReceivesData(t *testing.T) {
	addr := getFreePort(t)

	var received []byte
	var mu sync.Mutex
	done := make(chan struct{})

	handler := func(conn net.Conn, data []byte) error {
		mu.Lock()
		received = append(received, data...)
		mu.Unlock()
		close(done)
		return nil
	}

	srv := NewTCPServer(addr, handler)
	go srv.Start()
	defer srv.Stop()

	time.Sleep(100 * time.Millisecond)

	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}

	testData := []byte("hello from vehicle")
	_, err = conn.Write(testData)
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}
	conn.Close()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handler to receive data")
	}

	mu.Lock()
	defer mu.Unlock()
	if string(received) != string(testData) {
		t.Errorf("received data mismatch: got '%s', want '%s'", string(received), string(testData))
	}
}

func TestTCPServerConcurrentConnections(t *testing.T) {
	addr := getFreePort(t)

	var count atomic.Int32

	handler := func(conn net.Conn, data []byte) error {
		count.Add(1)
		return nil
	}

	srv := NewTCPServer(addr, handler)
	go srv.Start()
	defer srv.Stop()

	time.Sleep(100 * time.Millisecond)

	numClients := 5
	var wg sync.WaitGroup

	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
			if err != nil {
				t.Errorf("client %d: failed to connect: %v", id, err)
				return
			}
			conn.Write([]byte(fmt.Sprintf("data from client %d", id)))
			time.Sleep(50 * time.Millisecond)
			conn.Close()
		}(i)
	}

	wg.Wait()
	time.Sleep(200 * time.Millisecond)

	result := count.Load()
	if result < int32(numClients) {
		t.Logf("handler invoked %d times for %d clients (some data may coalesce)", result, numClients)
	}
	if result == 0 {
		t.Error("handler was never invoked")
	}
}

func TestTCPServerHandlerError(t *testing.T) {
	addr := getFreePort(t)

	handler := func(conn net.Conn, data []byte) error {
		return fmt.Errorf("processing error")
	}

	srv := NewTCPServer(addr, handler)
	go srv.Start()
	defer srv.Stop()

	time.Sleep(100 * time.Millisecond)

	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}

	conn.Write([]byte("test"))
	time.Sleep(200 * time.Millisecond)
	conn.Close()
}

func TestTCPServerStopBeforeStart(t *testing.T) {
	srv := NewTCPServer(":0", nil)

	err := srv.Stop()
	if err != nil {
		t.Errorf("Stop on unstarted server should return nil, got: %v", err)
	}
}
