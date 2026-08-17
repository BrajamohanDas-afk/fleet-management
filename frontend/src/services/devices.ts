import { api } from './api';
import type { ConnectionStatus, DeviceSource, Protocol } from '../types';

export interface DeviceOut {
  id: number;
  vehicle_id: number | null;
  device_serial: string;
  sim_number: string;
  protocol: Protocol;
  source: DeviceSource;
  external_device_id: number | null;
  external_device_identifier: string | null;
  connection_status: ConnectionStatus;
  last_seen_at: string | null;
  last_external_sync_at: string | null;
}

export interface DeviceCreate {
  device_serial: string;
  sim_number?: string;
  protocol?: Protocol;
  source?: DeviceSource;
  external_device_id?: number | null;
  external_device_identifier?: string | null;
}

export async function getVehicleDevices(vehicleId: number): Promise<DeviceOut[]> {
  return (await api.get<DeviceOut[]>(`/vehicles/${vehicleId}/devices`)).data;
}

export async function createVehicleDevice(vehicleId: number, data: DeviceCreate): Promise<DeviceOut> {
  return (await api.post<DeviceOut>(`/vehicles/${vehicleId}/devices`, data)).data;
}
