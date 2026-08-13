import { useQuery } from '@tanstack/react-query';
import { getChannels, getHealth } from '../services/video';
import type { DeviceChannelOut, DeviceHealth } from '../types';

const HEALTH_POLL_INTERVAL_MS = 3_000;

export interface UseVideoChannelsReturn {
  channels: DeviceChannelOut[];
  health: DeviceHealth[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<DeviceChannelOut[]>;
}

export function useVideoChannels(deviceId: number | null): UseVideoChannelsReturn {
  const channelsQuery = useQuery({
    queryKey: ['devices', deviceId, 'channels'],
    queryFn: () => getChannels(deviceId!),
    enabled: deviceId !== null,
  });

  const healthQuery = useQuery({
    queryKey: ['devices', deviceId, 'health'],
    queryFn: () => getHealth(deviceId!),
    enabled: deviceId !== null,
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
  });

  return {
    channels: channelsQuery.data ?? [],
    health: healthQuery.data ?? [],
    isLoading: channelsQuery.isLoading || healthQuery.isLoading,
    error: (channelsQuery.error ?? healthQuery.error) as Error | null,
    refetch: async () => {
      const [channelsResult] = await Promise.all([
        channelsQuery.refetch(),
        healthQuery.refetch(),
      ]);
      return channelsResult.data ?? [];
    },
  };
}
