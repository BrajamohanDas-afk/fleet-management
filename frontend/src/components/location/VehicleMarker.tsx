import { Marker, Popup, Tooltip } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { format } from 'date-fns';
import type { FleetPosition, VehicleStatus } from '../../types';

interface VehicleMarkerProps {
  position: FleetPosition;
  showPermanentLabel: boolean;
}

const STATUS_LABELS: Record<VehicleStatus, string> = {
  moving: 'Running',
  standing: 'Stationary',
  stale: 'Stale',
  offline: 'Offline',
};

const STATUS_COLORS: Record<VehicleStatus, string> = {
  moving: '#10b981', // emerald-500
  standing: '#3b82f6', // blue-500
  stale: '#f59e0b', // amber-500
  offline: '#64748b', // slate-500
};

function createMarkerIcon(status: VehicleStatus) {
  const color = STATUS_COLORS[status];
  return divIcon({
    className: 'custom-vehicle-marker',
    html: `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M16 30C16 30 4 20 4 12C4 6.477 9.373 2 16 2C22.627 2 28 6.477 28 12C28 20 16 30 16 30Z"
          fill="${color}"
          stroke="white"
          stroke-width="2"
        />
        <circle cx="16" cy="12" r="5" fill="white" />
      </svg>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 30],
    popupAnchor: [0, -30],
  });
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) return '--';
  try {
    return format(new Date(value), 'dd-MM-yyyy HH:mm');
  } catch {
    return '--';
  }
}

export default function VehicleMarker({
  position,
  showPermanentLabel,
}: VehicleMarkerProps) {
  if (position.latitude == null || position.longitude == null) return null;

  const status = position.status;
  const statusLabel = STATUS_LABELS[status];
  const speedText =
    position.speed_kmh != null ? `${Math.round(position.speed_kmh)} km/h` : '--';

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={createMarkerIcon(status)}
    >
      <Popup>
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-slate-900">
            {position.registration_no}
          </p>
          <p className="text-slate-600">
            Status: <span className="font-medium">{statusLabel}</span>
          </p>
          <p className="text-slate-600">
            Speed: <span className="font-medium">{speedText}</span>
          </p>
          <p className="text-xs text-slate-500">
            Last seen: {formatLastSeen(position.received_at)}
          </p>
        </div>
      </Popup>
      {showPermanentLabel && (
        <Tooltip
          direction="top"
          offset={[0, -30]}
          permanent
          className="vehicle-label-tooltip"
        >
          <span className="font-semibold">{position.registration_no}</span>
        </Tooltip>
      )}
    </Marker>
  );
}
