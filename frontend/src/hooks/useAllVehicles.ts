import { useQuery } from '@tanstack/react-query';
import { getVehicles } from '../services/vehicles';
import type { VehicleOut } from '../services/vehicles';

export interface UseAllVehiclesReturn {
  vehicles: VehicleOut[];
  isLoading: boolean;
  error: Error | null;
}

export function useAllVehicles(): UseAllVehiclesReturn {
  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: () => getVehicles({}),
  });

  return { vehicles, isLoading, error: error as Error | null };
}
