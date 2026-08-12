import { api } from './api';
import type { VehicleStatus } from '../types';
import type { FleetPosition } from '../types';

export interface FleetPositionsParams {
  status?: VehicleStatus | '';
  q?: string;
  bbox?: string;
}

export async function getFleetPositions(
  params: FleetPositionsParams = {}
): Promise<FleetPosition[]> {
  const query: Record<string, string> = {};
  if (params.status) query.status = params.status;
  if (params.q) query.q = params.q;
  if (params.bbox) query.bbox = params.bbox;

  const response = await api.get<FleetPosition[]>('/fleet/positions', {
    params: query,
  });
  return response.data;
}
