import { useMemo } from 'react';
import { Bike, Bus, Car, Crosshair, Gauge, HelpCircle, Smartphone, Truck } from 'lucide-react';
import { format } from 'date-fns';
import type { FleetPosition, VehicleStatus, VehicleType } from '../../types';

const VEHICLE_TYPE_ICONS: Record<VehicleType, typeof Car> = {
  bike: Bike,
  car: Car,
  truck: Truck,
  bus: Bus,
  other: HelpCircle,
};

const STATUS_LABELS: Record<VehicleStatus, string> = {
  moving: 'Running',
  standing: 'Stationary',
  stale: 'Stale',
  offline: 'Offline',
};

const STATUS_CLASS: Record<VehicleStatus, string> = {
  moving: 'status-moving',
  standing: 'status-standing',
  stale: 'status-stale',
  offline: 'status-offline',
};

const STATUS_DOT_CLASS: Record<VehicleStatus, string> = {
  moving: 'dot-moving',
  standing: 'dot-standing',
  stale: 'dot-stale',
  offline: 'dot-offline',
};

interface VehicleCardRailProps {
  positions: FleetPosition[];
  selectedVehicleId?: number | null;
  onSelect?: (position: FleetPosition) => void;
  onTrack: (position: FleetPosition) => void;
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) return '--';
  try {
    return format(new Date(value), 'dd-MM-yyyy HH:mm');
  } catch {
    return '--';
  }
}

export default function VehicleCardRail({
  positions,
  selectedVehicleId,
  onSelect,
  onTrack,
}: VehicleCardRailProps) {
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => a.registration_no.localeCompare(b.registration_no));
  }, [positions]);

  if (sorted.length === 0) {
    return (
      <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        No vehicles match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((position) => {
        const TypeIcon = VEHICLE_TYPE_ICONS[position.vehicle_type];
        const selected = selectedVehicleId === position.vehicle_id;
        const speedText = position.speed_kmh != null ? `${Math.round(position.speed_kmh)} km/h` : '--';
        const simText = position.sim_number?.trim() || '--';

        return (
          <div
            key={position.vehicle_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(position)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.(position);
              }
            }}
            className={`app-card cursor-pointer p-4 transition-colors hover:border-blue-300 ${selected ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="app-icon-box relative">
                  <TypeIcon className="h-5 w-5" />
                  <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${STATUS_DOT_CLASS[position.status]}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {position.registration_no}
                  </h3>
                  <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {position.vehicle_code}
                  </p>
                </div>
              </div>
              <span className={`app-chip ${STATUS_CLASS[position.status]}`}>{STATUS_LABELS[position.status]}</span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div className="app-muted-tile p-3">
                <p className="app-label mb-1 flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Speed</p>
                <p className="app-value truncate">{speedText}</p>
              </div>
              <div className="app-muted-tile p-3">
                <p className="app-label mb-1 flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> SIM</p>
                <p className="app-value truncate">{simText}</p>
              </div>
            </div>

            <div className="mb-3">
              <p className="app-label">Last known</p>
              <p className="truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
                {formatLastSeen(position.received_at)}
              </p>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onTrack(position);
              }}
              className="app-button app-button-primary w-full"
            >
              <Crosshair className="h-4 w-4" />
              Track
            </button>
          </div>
        );
      })}
    </div>
  );
}