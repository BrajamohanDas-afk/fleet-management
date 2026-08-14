import { useNavigate } from 'react-router-dom';
import { Bike, Bus, Car, HelpCircle, Link, Smartphone, Truck, Trash2 } from 'lucide-react';
import type { VehicleOut } from '../../services/vehicles';
import type { VehicleStatus, LicenseStatus, VehicleType } from '../../types';

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

const LICENSE_COLORS: Record<LicenseStatus, string> = {
  valid: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  suspended: 'bg-purple-100 text-purple-800',
};

interface VehicleCardProps {
  vehicle: VehicleOut;
  onEdit: (vehicle: VehicleOut) => void;
  onDelete: (id: number) => void;
  onConnect: (vehicle: VehicleOut) => void;
  onShare: (vehicle: VehicleOut) => void;
}

export default function VehicleCard({ vehicle, onEdit, onDelete, onConnect, onShare }: VehicleCardProps) {
  const navigate = useNavigate();
  const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];
  const status = vehicle.latest?.status ?? 'offline';

  const deviceCode =
    vehicle.device_serial?.trim() ||
    vehicle.latest?.device_serial?.trim() ||
    '--';
  const simNumber =
    vehicle.sim_number?.trim() ||
    vehicle.latest?.sim_number?.trim() ||
    '--';
  const hasDevice = Boolean(vehicle.device_id ?? vehicle.latest?.device_id);

  const handleOverview = () => {
    navigate(`/dashboard/video?vehicleId=${vehicle.id}`);
  };

  return (
    <div className="rounded-xl p-5 shadow-sm transition-shadow hover:shadow-md" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-50)', color: 'var(--accent-600)' }}>
            <TypeIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {vehicle.registration_no}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{vehicle.vehicle_code}</p>
          </div>
        </div>
        <span
          className={[
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            STATUS_COLORS[status],
          ].join(' ')}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-y-3 text-sm">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Device code</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{deviceCode}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>SIM</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{simNumber}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Speed limit</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {vehicle.speed_limit_kmh !== null
              ? `${vehicle.speed_limit_kmh} km/h`
              : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>License</p>
          <span
            className={[
              'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
              LICENSE_COLORS[vehicle.license_status],
            ].join(' ')}
          >
            {vehicle.license_status}
          </span>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1">
          Tracker status: {hasDevice ? 'Registered' : 'Not connected'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOverview}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-80"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => onEdit(vehicle)}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-80"
          style={{ backgroundColor: 'var(--accent-600)', color: 'var(--text-inverse)' }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this vehicle?')) {
              onDelete(vehicle.id);
            }
          }}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-80"
          style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
        <button
          type="button"
          onClick={() => onConnect(vehicle)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          <Smartphone className="h-4 w-4" />
          Tracker
        </button>
        <button
          type="button"
          onClick={() => onShare(vehicle)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Link className="h-4 w-4" />
          Share
        </button>
      </div>
    </div>
  );
}

