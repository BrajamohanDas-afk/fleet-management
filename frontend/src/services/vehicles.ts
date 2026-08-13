import { api } from './api';
import type { Vehicle, VehicleStatus, VehicleType, LicenseStatus } from '../types';

export interface VehicleLatest {
  vehicle_id: number;
  device_id: number | null;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading_deg: number | null;
  ignition_on: boolean | null;
  recorded_at: string | null;
  received_at: string | null;
  status: VehicleStatus;
  updated_at: string;
  // Device info is not guaranteed by the API contract but may be present.
  device_serial?: string | null;
  sim_number?: string | null;
}

export type VehicleOut = Vehicle & {
  latest?: VehicleLatest | null;
  device_id?: number | null;
  device_serial?: string | null;
  sim_number?: string | null;
};

export interface VehicleCreate {
  registration_no: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  speed_limit_kmh?: number | null;
  license_status: LicenseStatus;
  license_expiry?: string | null;
  device?: {
    device_serial: string;
    sim_number: string;
    protocol: string;
    cameras: Array<{
      channel_no: number;
      label: string;
      rtsp_url: string;
    }>;
  } | null;
}

export type VehicleUpdate = Partial<VehicleCreate>;

export interface VehicleListParams {
  q?: string;
  status?: VehicleStatus | '';
  type?: VehicleType | '';
}

export async function getVehicles(params: VehicleListParams = {}): Promise<VehicleOut[]> {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.status) query.status = params.status;
  if (params.type) query.type = params.type;

  const response = await api.get<VehicleOut[]>('/vehicles', { params: query });
  return response.data;
}

export async function getVehicle(id: number): Promise<VehicleOut> {
  const response = await api.get<VehicleOut>(`/vehicles/${id}`);
  return response.data;
}

export async function createVehicle(data: VehicleCreate): Promise<VehicleOut> {
  const response = await api.post<VehicleOut>('/vehicles', data);
  return response.data;
}

export async function updateVehicle(id: number, data: VehicleUpdate): Promise<VehicleOut> {
  const response = await api.patch<VehicleOut>(`/vehicles/${id}`, data);
  return response.data;
}

export async function deleteVehicle(id: number): Promise<void> {
  await api.delete(`/vehicles/${id}`);
}

export interface CameraChannel {
  id: number;
  device_id: number;
  channel_no: number;
  label: string;
  stream_path: string | null;
  stream_url: string | null;
  rtsp_url: string | null;
}

export interface CameraUpdateItem {
  channel_no: number;
  label?: string;
  rtsp_url: string;
}

export async function getVehicleCameras(deviceId: number): Promise<CameraChannel[]> {
  const response = await api.get<CameraChannel[]>(`/devices/${deviceId}/channels`);
  return response.data;
}

export async function updateVehicleCameras(vehicleId: number, cameras: CameraUpdateItem[]): Promise<void> {
  await api.patch(`/vehicles/${vehicleId}/cameras`, { cameras });
}

export async function testRtspUrl(rtspUrl: string, vehicleId?: number): Promise<{ status: string; detail?: string }> {
  const path = vehicleId ? `/vehicles/${vehicleId}/cameras/test` : '/vehicles/cameras/test';
  const response = await api.post<{ status: string; detail?: string }>(path, { rtsp_url: rtspUrl });
  return response.data;
}
