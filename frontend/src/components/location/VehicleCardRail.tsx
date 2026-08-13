import { useMemo } from 'react';
import { Bike, Bus, Car, HelpCircle, Truck, Crosshair } from 'lucide-react';
import { format } from 'date-fns';
import type {
  FleetPosition,
  VehicleStatus,
  VehicleType,
} from '../../types';

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

const STATUS_COLORS: Record<VehicleStatus, string> = {
  moving: 'bg-emerald-100 text-emerald-800',
  standing: 'bg-blue-100 text-blue-800',
  stale: 'bg-amber-100 text-amber-800',
  offline: 'bg-slate-100 text-slate-800',
};

interface VehicleCardRailProps {
  positions: FleetPosition[];
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
  onTrack,
}: VehicleCardRailProps) {
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) =>
      a.registration_no.localeCompare(b.registration_no)
    );
  }, [positions]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        No vehicles match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((position) => {
        const TypeIcon = VEHICLE_TYPE_ICONS[position.vehicle_type];
        const statusLabel = STATUS_LABELS[position.status];
        const statusColor = STATUS_COLORS[position.status];
        const speedText =
          position.speed_kmh != null
            ? `${Math.round(position.speed_kmh)} km/h`
            : '--';
        const simText = position.sim_number?.trim() || '--';

        return (
          <div
            key={position.vehicle_id}
            className="rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <TypeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {position.registration_no}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {position.vehicle_code}
                  </p>
                </div>
              </div>
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  statusColor,
                ].join(' ')}
              >
                {statusLabel}
              </span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-y-2 text-sm">
              <div className="col-span-2"><p className="text-xs text-slate-500">Tracker</p><p className="font-medium text-slate-900">{position.source === 'traccar' ? `Phone · ${position.connection_status ?? 'waiting'}` : position.source ?? 'simulator'}</p></div>
              <div>
                <p className="text-xs text-slate-500">Speed</p>
                <p className="font-medium text-slate-900">{speedText}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">SIM</p>
                <p className="font-medium text-slate-900">{simText}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Last known</p>
                <p className="font-medium text-slate-900">
                  {formatLastSeen(position.received_at)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTrack(position)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
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
