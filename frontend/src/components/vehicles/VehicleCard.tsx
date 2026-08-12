import { useNavigate } from 'react-router-dom';
import { Bike, Bus, Car, HelpCircle, Truck } from 'lucide-react';
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
}

export default function VehicleCard({ vehicle, onEdit }: VehicleCardProps) {
  const navigate = useNavigate();
  const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];
  const status = vehicle.latest?.status ?? 'offline';

  const deviceCode = vehicle.latest?.device_serial ?? '--';
  const simNumber = vehicle.latest?.sim_number ?? '--';

  const handleOverview = () => {
    navigate(`/dashboard/video?vehicleId=${vehicle.id}`);
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <TypeIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {vehicle.registration_no}
            </h3>
            <p className="text-sm text-slate-500">{vehicle.vehicle_code}</p>
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
          <p className="text-xs text-slate-500">Device code</p>
          <p className="font-medium text-slate-900">{deviceCode}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">SIM</p>
          <p className="font-medium text-slate-900">{simNumber}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Speed limit</p>
          <p className="font-medium text-slate-900">
            {vehicle.speed_limit_kmh !== null
              ? `${vehicle.speed_limit_kmh} km/h`
              : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">License</p>
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOverview}
          className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => onEdit(vehicle)}
          className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
