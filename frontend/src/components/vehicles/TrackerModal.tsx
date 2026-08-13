import { useState } from 'react';
import { X } from 'lucide-react';
import { createVehicleDevice, getPairingInfo, type PairingInfo } from '../../services/devices';
import type { VehicleOut } from '../../services/vehicles';

export default function TrackerModal({ vehicle, onClose }: { vehicle: VehicleOut; onClose: () => void }) {
  const [identifier, setIdentifier] = useState(`${vehicle.vehicle_code.toLowerCase()}-${vehicle.id}`);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const connect = async () => {
    setPending(true); setError(null);
    try {
      const device = await createVehicleDevice(vehicle.id, {
        device_serial: identifier,
        external_device_identifier: identifier,
        source: 'traccar',
        protocol: 'other',
      });
      setPairing(await getPairingInfo(device.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect tracker');
    } finally { setPending(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">Connect Tracker</h2><p className="text-sm text-slate-500">{vehicle.registration_no} · Phone / Traccar Client</p></div><button onClick={onClose} aria-label="Close"><X /></button></div>
      {!pairing ? <>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracker-identifier">Traccar device identifier</label>
        <input id="tracker-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2" />
        <p className="mb-4 text-xs text-slate-500">Use the same identifier in the Traccar Client app. WhatsApp location links are not supported as tracker sources.</p>
        {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button disabled={pending || !identifier.trim()} onClick={() => void connect()} className="w-full rounded-lg bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">{pending ? 'Connecting…' : 'Create phone tracker'}</button>
      </> : <>
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Waiting for first location</p><p className="mt-1">Traccar Client URL: <code>{pairing.server_url}</code></p><p>Identifier: <code>{pairing.identifier}</code></p></div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">{pairing.setup_instructions.map((item) => <li key={item}>{item}</li>)}</ol>
        <button onClick={onClose} className="mt-5 w-full rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700">Done</button>
      </>}
    </div>
  </div>;
}
