import { api } from './api';

export interface TripCreate {
  vehicle_id: number;
  driver_name?: string | null;
  driver_phone?: string | null;
  origin?: string | null;
  destination?: string | null;
}

export interface TripOut {
  id: number;
  vehicle_id: number;
  driver_id: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  status: 'CREATED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  origin: string | null;
  destination: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export interface TrackingSessionOut {
  id: number;
  trip_id: number | null;
  status:
    | 'CREATED'
    | 'WAITING_FOR_DRIVER'
    | 'ACTIVE'
    | 'PAUSED'
    | 'OFFLINE'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'REVOKED'
    | 'PERMISSION_DENIED';
  url: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

export async function createTrip(payload: TripCreate): Promise<TripOut> {
  return (await api.post<TripOut>('/v1/trips', payload)).data;
}

export async function createTrackingSession(
  tripId: number,
  durationMinutes: number
): Promise<TrackingSessionOut> {
  return (
    await api.post<TrackingSessionOut>(
      `/v1/trips/${tripId}/tracking-session`,
      { duration_minutes: durationMinutes }
    )
  ).data;
}
