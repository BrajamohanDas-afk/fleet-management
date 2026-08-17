import { useEffect, useState } from 'react';
import { Copy, Loader2, Navigation, X } from 'lucide-react';
import type { VehicleOut } from '../../services/vehicles';
import {
  createTrackingSession,
  createTrip,
  type TrackingSessionOut,
} from '../../services/trips';

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

interface TrackingLinkModalProps {
  vehicle: VehicleOut;
  onClose: () => void;
}

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function linkForCurrentOrigin(rawUrl: string): string {
  try {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return rawUrl;
    }

    const url = new URL(rawUrl);
    return `${window.location.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}

export default function TrackingLinkModal({
  vehicle,
  onClose,
}: TrackingLinkModalProps) {
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState(1440);
  const [session, setSession] = useState<TrackingSessionOut | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const driverLink = session ? linkForCurrentOrigin(session.url) : '';

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setCopied(false);
    setIsCreating(true);

    try {
      const trip = await createTrip({
        vehicle_id: vehicle.id,
        driver_name: optionalValue(driverName),
        driver_phone: optionalValue(driverPhone),
        origin: optionalValue(origin),
        destination: optionalValue(destination),
      });
      const trackingSession = await createTrackingSession(trip.id, duration);
      setSession(trackingSession);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create the tracking link.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(driverLink);
    setCopied(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracking-link-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="tracking-link-title"
              className="flex items-center gap-2 text-xl font-bold text-slate-900"
            >
              <Navigation className="h-5 w-5 text-primary-600" />
              Create driver tracking link
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The driver opens this link, taps Start tracking, and allows
              location permission.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!session ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Vehicle: <span className="font-semibold text-slate-900">{vehicle.registration_no}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracking-driver-name">
                  Driver name
                </label>
                <input
                  id="tracking-driver-name"
                  value={driverName}
                  onChange={(event) => setDriverName(event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracking-driver-phone">
                  Driver phone
                </label>
                <input
                  id="tracking-driver-phone"
                  value={driverPhone}
                  onChange={(event) => setDriverPhone(event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracking-origin">
                  Origin
                </label>
                <input
                  id="tracking-origin"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracking-destination">
                  Destination
                </label>
                <input
                  id="tracking-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tracking-duration">
                Link duration
              </label>
              <select
                id="tracking-duration"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className={INPUT_CLASS}
              >
                <option value={60}>1 hour</option>
                <option value={480}>8 hours</option>
                <option value={1440}>24 hours</option>
                <option value={10080}>7 days</option>
              </select>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCreating ? 'Creating link...' : 'Create tracking link'}
            </button>
          </form>
        ) : (
          <div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="mb-2 font-semibold text-slate-900">
                Send this link to the driver
              </p>
              <p className="break-all">{driverLink}</p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Expires {new Date(session.expires_at).toLocaleString()}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
