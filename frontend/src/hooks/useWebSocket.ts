import { useCallback, useEffect, useRef, useState } from 'react';

export type WebSocketMessage =
  | { type: 'snapshot'; data: unknown }
  | { type: 'update'; data: unknown }
  | { type: 'heartbeat' }
  | { type: string; data?: unknown };

export interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];
const MAX_RECONNECT_DELAY_MS = 15000;

function nextReconnectDelayMs(attempt: number): number {
  if (attempt >= RECONNECT_DELAYS_MS.length) return MAX_RECONNECT_DELAY_MS;
  return RECONNECT_DELAYS_MS[attempt];
}

function deriveWsUrl(apiBaseUrl: string, path: string): string {
  if (apiBaseUrl.startsWith('/')) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}${path}`;
  }

  // Drop a trailing /api segment and switch from http(s) to ws(s).
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  const wsBase = base
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  return `${wsBase}${path}`;
}

/**
 * Generic WebSocket hook with bounded exponential backoff reconnect.
 *
 * The hook exposes the latest parsed message, connection state, and any
 * connection error. Reconnects are automatic after an unexpected close and
 * capped at 15s between attempts.
 */
export function useWebSocket(
  apiBaseUrl: string,
  path: string
): UseWebSocketReturn {
  const url = deriveWsUrl(apiBaseUrl, path);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountingRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    if (wsRef.current) {
      // Stop automatic reconnects while the caller is intentionally closing.
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (isUnmountingRef.current) return;
    clearReconnectTimer();

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountingRef.current) {
          ws.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as WebSocketMessage;
          setLastMessage(parsed);
        } catch {
          // Ignore malformed messages; they should not break the feed.
        }
      };

      ws.onerror = () => {
        setError(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (isUnmountingRef.current) return;

        const delay = nextReconnectDelayMs(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to open WebSocket')
      );
    }
  }, [url, clearReconnectTimer]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();
    return () => {
      isUnmountingRef.current = true;
      disconnect();
    };
  }, [connect, disconnect]);

  return { isConnected, lastMessage, error, connect, disconnect };
}
