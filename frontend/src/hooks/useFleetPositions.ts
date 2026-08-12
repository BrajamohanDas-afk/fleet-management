import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../services/api';
import { getFleetPositions } from '../services/fleet';
import { useWebSocket } from './useWebSocket';
import type { FleetPosition } from '../types';
import type { FleetPositionsParams } from '../services/fleet';

export interface UseFleetPositionsReturn {
  positions: FleetPosition[];
  isLoading: boolean;
  error: Error | null;
  isConnected: boolean;
}

function isFleetPosition(value: unknown): value is FleetPosition {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.vehicle_id === 'number' &&
    typeof candidate.registration_no === 'string' &&
    typeof candidate.status === 'string'
  );
}

function mergeUpdate(
  positions: FleetPosition[],
  update: FleetPosition
): FleetPosition[] {
  const index = positions.findIndex(
    (position) => position.vehicle_id === update.vehicle_id
  );
  if (index === -1) {
    return [...positions, update];
  }
  const next = [...positions];
  next[index] = update;
  return next;
}

const POLL_INTERVAL_MS = 15000;

/**
 * Load the current fleet snapshot via REST and keep it in sync with the
 * WebSocket fleet feed. When the socket drops, automatically fall back to
 * polling the REST endpoint every 15 seconds.
 */
export function useFleetPositions(
  params: FleetPositionsParams = {}
): UseFleetPositionsReturn {
  const {
    data: initialPositions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['fleet', 'positions', params],
    queryFn: () => getFleetPositions(params),
  });

  const { isConnected, lastMessage } = useWebSocket(
    API_BASE_URL,
    '/ws/fleet/positions'
  );

  const [positions, setPositions] = useState<FleetPosition[]>([]);

  // Seed positions from REST when there is no live data yet, and keep them
  // in sync with REST while the WebSocket is disconnected.
  useEffect(() => {
    if (initialPositions.length === 0) return;
    if (isConnected && positions.length > 0) return;
    setPositions(initialPositions);
  }, [initialPositions, isConnected, positions.length]);

  // Merge WebSocket snapshot or single-vehicle updates.
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'snapshot' && Array.isArray(lastMessage.data)) {
      const valid = lastMessage.data.filter(isFleetPosition);
      setPositions(valid);
    } else if (
      lastMessage.type === 'update' &&
      isFleetPosition(lastMessage.data)
    ) {
      setPositions((prev) => mergeUpdate(prev, lastMessage.data as FleetPosition));
    }
  }, [lastMessage]);

  // Fallback polling when the WebSocket is disconnected.
  useEffect(() => {
    if (isConnected) return;
    const intervalId = setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isConnected, refetch]);

  // While loading and no positions yet, prefer the REST data so cards/map
  // render as early as possible.
  const displayedPositions = useMemo(() => {
    return positions.length > 0 ? positions : initialPositions;
  }, [positions, initialPositions]);

  return {
    positions: displayedPositions,
    isLoading,
    error: error as Error | null,
    isConnected,
  };
}
