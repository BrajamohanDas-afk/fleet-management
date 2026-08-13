export type VehicleStatus = 'moving' | 'standing' | 'stale' | 'offline';

export type VehicleType = 'bike' | 'car' | 'truck' | 'bus' | 'other';

export type LicenseStatus = 'valid' | 'expired' | 'pending' | 'suspended';

export type Protocol = 'jt808' | 'sim' | 'other';
export type DeviceSource = 'simulator' | 'traccar' | 'jt808';
export type ConnectionStatus = 'waiting' | 'connected' | 'stale' | 'authentication_error' | 'unknown_device' | 'traccar_unavailable';

export interface Vehicle {
  id: number;
  registration_no: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  speed_limit_kmh: number | null;
  license_status: LicenseStatus;
  license_expiry: string | null;
  created_at: string;
}

export interface Device {
  id: number;
  vehicle_id: number | null;
  device_serial: string;
  sim_number: string;
  protocol: Protocol;
  last_seen_at: string | null;
  source: DeviceSource;
  external_device_id: number | null;
  external_device_identifier: string | null;
  connection_status: ConnectionStatus;
  last_external_sync_at: string | null;
}

export interface DeviceChannel {
  id: number;
  device_id: number;
  channel_no: number;
  label: string;
  stream_path: string | null;
  stream_url?: string | null;
  rtsp_url?: string | null;
}

export interface TelemetryPoint {
  id: number;
  device_id: number;
  recorded_at: string;
  received_at: string;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  heading_deg: number | null;
  ignition_on: boolean;
}

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
}

export interface FleetPosition extends VehicleLatest {
  registration_no: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  // Enrichment fields that may be supplied by the backend or merged from
  // the vehicle registry for cards and counters.
  sim_number?: string | null;
  license_status?: LicenseStatus | null;
  license_expiry?: string | null;
  source?: DeviceSource | null;
  connection_status?: ConnectionStatus | null;
}

export interface VideoClip {
  id: number;
  device_id: number;
  channel_no: number;
  started_at: string;
  ended_at: string | null;
  file_path: string;
  size_bytes: number | null;
}

export type ChannelState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'degraded'
  | 'reconnecting'
  | 'offline';

export interface DeviceChannelOut {
  id: number;
  device_id: number;
  channel_no: number;
  label: string;
  stream_path: string | null;
  stream_url: string | null;
  rtsp_url?: string | null;
}

export interface DeviceHealth {
  channel_no: number;
  label: string;
  state: ChannelState;
  last_frame_at: string | null;
}

export interface RecordingCreate {
  channel_no: number;
  duration_s: number;
}

export interface RecordingOut {
  id: number;
  device_id: number;
  channel_no: number;
  started_at: string;
  ended_at: string | null;
  file_path: string;
  size_bytes: number | null;
}

export interface User {
  id: number;
  username: string;
}
