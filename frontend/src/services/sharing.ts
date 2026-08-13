import { api } from './api';

export interface ShareLink {
  id: number;
  url: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface PublicLocation {
  vehicle_id: number;
  registration_no: string;
  vehicle_code: string;
  vehicle_type: 'bike' | 'car' | 'truck' | 'bus' | 'other';
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading_deg: number | null;
  ignition_on: boolean | null;
  status: string;
  recorded_at: string | null;
  received_at: string | null;
  expires_at: string;
}

export async function createShareLink(vehicleId: number, durationMinutes: number): Promise<ShareLink> {
  return (await api.post<ShareLink>(`/vehicles/${vehicleId}/share-links`, { duration_minutes: durationMinutes })).data;
}

export async function revokeShareLink(id: number): Promise<ShareLink> {
  return (await api.post<ShareLink>(`/share-links/${id}/revoke`)).data;
}

export async function getPublicLocation(token: string): Promise<PublicLocation> {
  return (await api.get<PublicLocation>(`/public/share/${token}`)).data;
}
