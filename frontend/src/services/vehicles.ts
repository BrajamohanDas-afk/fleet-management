import { api } from './api';
import type {
  CameraConnectionType,
  CameraSourceFormat,
  HttpCameraFormat,
  LicenseStatus,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from '../types';

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
  device_serial?: string | null;
  sim_number?: string | null;
}

export type VehicleOut = Vehicle & {
  latest?: VehicleLatest | null;
  device_id?: number | null;
  device_serial?: string | null;
  sim_number?: string | null;
  gps_feed_url?: string | null;
  gps_feed_enabled?: boolean | null;
};

export interface VehicleCameraPayload {
  channel_no: number;
  label: string;
  rtsp_url: string;
  source_url?: string;
  source_type?: CameraConnectionType;
  source_format?: HttpCameraFormat | 'rtsp';
  http_format?: HttpCameraFormat | 'rtsp';
}

export interface VehicleCreate {
  registration_no: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  speed_limit_kmh?: number | null;
  license_status: LicenseStatus;
  license_expiry?: string | null;
  gps_feed_url?: string | null;
  gps_feed_enabled?: boolean;
  device?: {
    device_serial: string;
    sim_number: string;
    protocol: string;
    cameras: VehicleCameraPayload[];
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
  source_url?: string | null;
  source_type?: CameraConnectionType | null;
  source_format?: CameraSourceFormat | null;
  http_stream_url?: string | null;
}

export interface CameraUpdateItem {
  channel_no: number;
  label?: string;
  rtsp_url: string;
  source_url?: string;
  source_type?: CameraConnectionType;
  source_format?: HttpCameraFormat | 'rtsp';
  http_format?: HttpCameraFormat | 'rtsp';
}

export interface CameraTestResult {
  status: string;
  detail?: string;
  source_type?: CameraConnectionType;
  source_format?: CameraSourceFormat;
}

export interface GpsFeedTestResult {
  status: string;
  json_reachable: boolean;
  has_fix: boolean;
  detail?: string;
  latitude?: number | null;
  longitude?: number | null;
  recorded_at?: string | null;
}

export async function getVehicleCameras(deviceId: number): Promise<CameraChannel[]> {
  const response = await api.get<CameraChannel[]>(`/devices/${deviceId}/channels`);
  return response.data;
}

export async function updateVehicleCameras(vehicleId: number, cameras: CameraUpdateItem[]): Promise<void> {
  await api.patch(`/vehicles/${vehicleId}/cameras`, { cameras });
}

export async function testCameraUrl(
  sourceUrl: string,
  sourceType: CameraConnectionType = 'rtsp',
  httpFormat: HttpCameraFormat = 'auto',
  vehicleId?: number
): Promise<CameraTestResult> {
  const path = vehicleId ? `/vehicles/${vehicleId}/cameras/test` : '/vehicles/cameras/test';
  const sourceFormat = sourceType === 'rtsp' ? 'rtsp' : httpFormat;
  const response = await api.post<CameraTestResult>(path, {
    rtsp_url: sourceUrl,
    source_url: sourceUrl,
    source_type: sourceType,
    source_format: sourceFormat,
    http_format: sourceFormat,
  });
  return response.data;
}

export async function testRtspUrl(rtspUrl: string, vehicleId?: number): Promise<CameraTestResult> {
  return testCameraUrl(rtspUrl, 'rtsp', 'auto', vehicleId);
}

export async function testGpsFeedUrl(
  feedUrl: string,
  vehicleId?: number
): Promise<GpsFeedTestResult> {
  const response = await api.post<GpsFeedTestResult>('/vehicles/gps-feed/test', {
    gps_feed_url: feedUrl,
    feed_url: feedUrl,
    vehicle_id: vehicleId,
  });
  return response.data;
}
