import { useState } from 'react';
import { Copy, Loader2, Share2, X } from 'lucide-react';
import { createShareLink, revokeShareLink, type ShareLink } from '../../services/sharing';
import type { VehicleOut } from '../../services/vehicles';

export default function ShareModal({ vehicle, onClose }: { vehicle: VehicleOut; onClose: () => void }) {
  const [duration, setDuration] = useState(60);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const create = async () => {
    setError(null);
    setCopied(false);
    setIsWorking(true);
    try {
      setLink(await createShareLink(vehicle.id, duration));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create link');
    } finally {
      setIsWorking(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
  };

  const revoke = async () => {
    if (!link) return;
    setIsWorking(true);
    try {
      setLink(await revokeShareLink(link.id));
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-link-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isWorking) onClose();
      }}
    >
      <div className="app-card app-animate-up w-full max-w-lg p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="app-icon-box status-standing">
              <Share2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="share-link-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Share live location
              </h2>
              <p className="mt-1 truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
                Only {vehicle.registration_no} will be visible.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isWorking} aria-label="Close" className="app-button app-button-muted h-9 w-9 p-0 disabled:opacity-60">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!link || link.revoked_at ? (
          <>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }} htmlFor="share-duration">
              Expires after
            </label>
            <select
              id="share-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="app-select mb-4 w-full"
            >
              <option value={15}>15 minutes</option>
              <option value={60}>1 hour</option>
              <option value={480}>8 hours</option>
              <option value={1440}>24 hours</option>
            </select>

            {error && (
              <p className="mb-3 rounded-lg p-3 text-sm font-medium" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
                {error}
              </p>
            )}

            <button type="button" onClick={() => void create()} disabled={isWorking} className="app-button app-button-primary w-full disabled:opacity-60">
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {isWorking ? 'Creating...' : 'Create expiring link'}
            </button>
          </>
        ) : (
          <>
            <div className="break-all rounded-lg border p-3 text-sm" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}>
              {link.url}
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Expires {new Date(link.expires_at).toLocaleString()}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void copy()} className="app-button app-button-primary flex-1">
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" onClick={() => void revoke()} disabled={isWorking} className="app-button app-button-danger disabled:opacity-60">
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Revoke
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
