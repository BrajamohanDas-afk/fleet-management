import { api } from './api';
import { API_BASE_URL } from './api';
import type {
  DeviceChannelOut,
  DeviceHealth,
  RecordingCreate,
  RecordingOut,
} from '../types';

export async function getChannels(deviceId: number): Promise<DeviceChannelOut[]> {
  const response = await api.get<DeviceChannelOut[]>(`/devices/${deviceId}/channels`);
  return response.data;
}

export async function getHealth(deviceId: number): Promise<DeviceHealth[]> {
  const response = await api.get<DeviceHealth[]>(`/devices/${deviceId}/health`);
  return response.data;
}


export async function startStreams(deviceId: number): Promise<{ started: number }> {
  const response = await api.post<{ started: number }>(`/devices/${deviceId}/streams/start`);
  return response.data;
}
export async function startRecording(
  deviceId: number,
  data: RecordingCreate
): Promise<RecordingOut> {
  const response = await api.post<RecordingOut>(`/devices/${deviceId}/recordings`, data);
  return response.data;
}

export async function getRecordings(): Promise<RecordingOut[]> {
  const response = await api.get<RecordingOut[]>('/recordings');
  return response.data;
}

export function getRecordingDownloadUrl(id: number): string {
  return `${API_BASE_URL}/recordings/${id}/download`;
}

export function downloadRecording(id: number): string {
  return getRecordingDownloadUrl(id);
}
