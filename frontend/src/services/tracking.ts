import axios from 'axios';
import { API_BASE_URL } from './api';
import type {
  TrackingHeartbeatPayload,
  TrackingLocationPayload,
  TrackingPermissionDeniedPayload,
  TrackingSession,
  TrackingUploadResponse,
} from '../types';

const publicTrackingApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function getTrackingSession(token: string): Promise<TrackingSession> {
  return (
    await publicTrackingApi.get<TrackingSession>(
      `/v1/tracking/session/${encodeURIComponent(token)}`
    )
  ).data;
}

export async function uploadTrackingLocation(
  payload: TrackingLocationPayload
): Promise<TrackingUploadResponse> {
  return (
    await publicTrackingApi.post<TrackingUploadResponse>(
      '/v1/tracking/location',
      payload
    )
  ).data;
}

export async function sendTrackingHeartbeat(
  payload: TrackingHeartbeatPayload
): Promise<void> {
  await publicTrackingApi.post('/v1/tracking/heartbeat', payload);
}

export async function reportTrackingPermissionDenied(
  payload: TrackingPermissionDeniedPayload
): Promise<void> {
  await publicTrackingApi.post('/v1/tracking/permission-denied', payload);
}
