import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { createShareLink, revokeShareLink, type ShareLink } from '../../services/sharing';
import type { VehicleOut } from '../../services/vehicles';

export default function ShareModal({ vehicle, onClose }: { vehicle: VehicleOut; onClose: () => void }) {
  const [duration, setDuration] = useState(60);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = async () => { try { setLink(await createShareLink(vehicle.id, duration)); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create link'); } };
  const copy = async () => { if (!link) return; await navigator.clipboard.writeText(link.url); setCopied(true); };
  const revoke = async () => { if (link) setLink(await revokeShareLink(link.id)); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-900">Share live location</h2><p className="text-sm text-slate-500">Only {vehicle.registration_no} will be visible.</p></div><button onClick={onClose} aria-label="Close"><X /></button></div>{!link || link.revoked_at ? <><label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="share-duration">Expires after</label><select id="share-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2"><option value={15}>15 minutes</option><option value={60}>1 hour</option><option value={480}>8 hours</option><option value={1440}>24 hours</option></select>{error && <p className="mb-3 text-sm text-red-700">{error}</p>}<button onClick={() => void create()} className="w-full rounded-lg bg-primary-600 px-4 py-2 font-medium text-white">Create expiring link</button></> : <><div className="break-all rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{link.url}</div><p className="mt-2 text-xs text-slate-500">Expires {new Date(link.expires_at).toLocaleString()}</p><div className="mt-4 flex gap-2"><button onClick={() => void copy()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy link'}</button><button onClick={() => void revoke()} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700">Revoke</button></div></>}</div></div>;
}
