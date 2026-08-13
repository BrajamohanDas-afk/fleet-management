import { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import { useVideoPanelContext } from '../contexts/VideoPanelContext';
import type { DeviceHealth } from '../types';

type PanelState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'degraded'
  | 'reconnecting'
  | 'offline';

interface State {
  state: PanelState;
  lastFrameAt: Date | null;
  attemptCount: number;
  connectionKey: number;
  isRegistered: boolean;
}

type Action =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'RETRY' }
  | { type: 'HEALTH'; payload: DeviceHealth | null }
  | { type: 'STREAM_READY' }
  | { type: 'STREAM_ERROR' }
  | { type: 'RECONNECT_TICK' }
  | { type: 'REGISTER'; registered: boolean };

const DEGRADED_AGE_MS = 5_000;
const RECONNECT_AGE_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;

function computeStateFromHealth(
  current: PanelState,
  health: DeviceHealth | null,
  lastFrameAt: Date | null
): PanelState {
  if (current === 'idle') return current;

  if (!health) {
    if (current === 'offline') return current;
    return 'reconnecting';
  }

  if (health.state === 'offline') return 'offline';

  if (health.state === 'live' || health.state === 'connecting') {
    if (current === 'connecting' || current === 'reconnecting') return current;
    return 'live';
  }

  const frameTime = health.last_frame_at
    ? new Date(health.last_frame_at)
    : lastFrameAt;
  const ageMs = frameTime ? Date.now() - frameTime.getTime() : 0;

  if (ageMs > RECONNECT_AGE_MS) return 'reconnecting';
  if (ageMs > DEGRADED_AGE_MS || health.state === 'degraded') return 'degraded';
  return current;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START': {
      if (!state.isRegistered) return state;
      return {
        ...state,
        state: 'connecting',
        attemptCount: 0,
        connectionKey: state.connectionKey + 1,
      };
    }
    case 'STOP':
      return {
        ...state,
        state: 'idle',
        attemptCount: 0,
        connectionKey: 0,
      };
    case 'RETRY': {
      if (!state.isRegistered) return state;
      return {
        ...state,
        state: 'connecting',
        attemptCount: 0,
        connectionKey: state.connectionKey + 1,
      };
    }
    case 'STREAM_READY': {
      if (state.state === 'connecting' || state.state === 'reconnecting') {
        return {
          ...state,
          state: 'live',
          lastFrameAt: new Date(),
          attemptCount: 0,
        };
      }
      return state;
    }
    case 'STREAM_ERROR': {
      if (state.state === 'connecting') {
        return { ...state, state: 'reconnecting' };
      }
      return state;
    }
    case 'HEALTH': {
      const health = action.payload;
      const lastFrameAt = health?.last_frame_at
        ? new Date(health.last_frame_at)
        : state.lastFrameAt;
      const nextState = computeStateFromHealth(
        state.state,
        health,
        lastFrameAt
      );
      return { ...state, state: nextState, lastFrameAt };
    }
    case 'RECONNECT_TICK': {
      if (state.state !== 'reconnecting') return state;
      if (state.attemptCount >= MAX_RECONNECT_ATTEMPTS) {
        return { ...state, state: 'offline' };
      }
      return {
        ...state,
        state: 'connecting',
        attemptCount: state.attemptCount + 1,
        connectionKey: state.connectionKey + 1,
      };
    }
    case 'REGISTER':
      return { ...state, isRegistered: action.registered };
    default:
      return state;
  }
}

function reconnectDelayMs(attemptCount: number): number {
  if (attemptCount <= 0) return BASE_BACKOFF_MS;
  const exponential = BASE_BACKOFF_MS * 2 ** (attemptCount - 1);
  return Math.min(exponential, MAX_BACKOFF_MS);
}

export interface UseVideoPanelStateReturn {
  state: PanelState;
  isRegistered: boolean;
  lastFrameAt: Date | null;
  connectionKey: number;
  start: () => void;
  stop: () => void;
  retry: () => void;
  updateHealth: (health: DeviceHealth | null) => void;
  onStreamReady: () => void;
  onStreamError: () => void;
}

export function useVideoPanelState(): UseVideoPanelStateReturn {
  const id = useId();
  const { registerPanel, unregisterPanel } = useVideoPanelContext();
  const [state, dispatch] = useReducer(reducer, {
    state: 'idle',
    lastFrameAt: null,
    attemptCount: 0,
    connectionKey: 0,
    isRegistered: false,
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const registered = registerPanel(id);
    dispatch({ type: 'REGISTER', registered });
    return () => {
      unregisterPanel(id);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [id, registerPanel, unregisterPanel]);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (state.state !== 'reconnecting') return;

    const delay = reconnectDelayMs(state.attemptCount);
    timeoutRef.current = setTimeout(() => {
      dispatch({ type: 'RECONNECT_TICK' });
    }, delay);
  }, [state.state, state.attemptCount, state.connectionKey]);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const stop = useCallback(() => dispatch({ type: 'STOP' }), []);
  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);
  const updateHealth = useCallback(
    (health: DeviceHealth | null) => dispatch({ type: 'HEALTH', payload: health }),
    []
  );
  const onStreamReady = useCallback(
    () => dispatch({ type: 'STREAM_READY' }),
    []
  );
  const onStreamError = useCallback(
    () => dispatch({ type: 'STREAM_ERROR' }),
    []
  );

  return {
    state: state.state,
    isRegistered: state.isRegistered,
    lastFrameAt: state.lastFrameAt,
    connectionKey: state.connectionKey,
    start,
    stop,
    retry,
    updateHealth,
    onStreamReady,
    onStreamError,
  };
}
