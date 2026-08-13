import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FleetPosition } from '../types';
import { getPublicLocation } from '../services/sharing';
import MapView from '../components/location/MapView';

export default function PublicShare() {
  const { token = '' } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['public-share', token], queryFn: () => getPublicLocation(token), enabled: Boolean(token), refetchInterval: 10000 });
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Loading shared location…</div>;
  if (error || !data) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center text-red-700">This sharing link is invalid, revoked, or expired.</div>;
  const position: FleetPosition = { ...data, vehicle_type: data.vehicle_type, status: data.status as FleetPosition['status'], updated_at: data.received_at ?? data.expires_at, device_id: null };
  return <div className="flex min-h-screen flex-col bg-slate-50 p-4"><div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4"><div className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-xl font-bold text-slate-900">Live location · {data.registration_no}</h1><p className="text-sm text-slate-500">{data.vehicle_code} · Last update {data.received_at ? new Date(data.received_at).toLocaleString() : 'not available'} · Link expires {new Date(data.expires_at).toLocaleString()}</p></div><div className="min-h-[70vh] flex-1"><MapView positions={[position]} showPermanentLabels focusTarget={null} /></div></div></div>;
}
