import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, Bus, Camera, Car, Edit3, Gauge, HelpCircle, RadioTower, Share2, ShieldCheck, Trash2, Truck } from 'lucide-react';
import type { VehicleOut } from '../../services/vehicles';
import type { LicenseStatus, VehicleStatus, VehicleType } from '../../types';

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

const LICENSE_CLASS: Record<LicenseStatus, string> = {
  valid: 'status-moving',
  expired: 'border-red-100 bg-red-50 text-red-700',
  pending: 'status-stale',
  suspended: 'status-offline',
};

interface VehicleCardProps {
  vehicle: VehicleOut;
  onEdit: (vehicle: VehicleOut) => void;
  onRequestDelete: (vehicle: VehicleOut) => void;
  onShare: (vehicle: VehicleOut) => void;
}

function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="app-muted-tile p-3">
      <p className="app-label mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="app-value truncate text-sm">{value}</p>
    </div>
  );
}

export default function VehicleCard({
  vehicle,
  onEdit,
  onRequestDelete,
  onShare,
}: VehicleCardProps) {
  const navigate = useNavigate();
  const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];
  const status = vehicle.latest?.status ?? 'offline';

  const gpsFeedUrl = vehicle.gps_feed_url?.trim() || '';
  const gpsFeedLabel = gpsFeedUrl ? gpsFeedUrl.replace(/^https?:\/\//, '') : '--';
  const gpsFeedEnabled = vehicle.gps_feed_enabled ?? Boolean(gpsFeedUrl);
  const deviceCode = vehicle.device_serial?.trim() || vehicle.latest?.device_serial?.trim() || '--';
  const hasDevice = Boolean(vehicle.device_id ?? vehicle.latest?.device_id);
  const hasGpsFeed = Boolean(gpsFeedUrl);

  const handleOverview = () => {
    navigate(`/dashboard/video?vehicleId=${vehicle.id}`);
  };

  return (
    <article className="app-card app-hover-lift p-4 transition-colors hover:border-blue-300">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="app-icon-box relative">
            <TypeIcon className="h-5 w-5" />
            <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${STATUS_DOT_CLASS[status]}`} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {vehicle.registration_no}
            </h3>
            <p className="truncate text-sm" style={{ color: 'var(--text-secondary)' }}>{vehicle.vehicle_code}</p>
          </div>
        </div>
        <span className={`app-chip ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field icon={<RadioTower className="h-3.5 w-3.5" />} label="GPS feed" value={gpsFeedLabel} />
        <Field icon={<Camera className="h-3.5 w-3.5" />} label="Camera device" value={deviceCode} />
        <Field icon={<Gauge className="h-3.5 w-3.5" />} label="Speed limit" value={vehicle.speed_limit_kmh !== null ? `${vehicle.speed_limit_kmh} km/h` : '--'} />
        <div className="app-muted-tile p-3">
          <p className="app-label mb-1 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> License
          </p>
          <span className={`app-chip max-w-full ${LICENSE_CLASS[vehicle.license_status]}`}>
            {vehicle.license_status}
          </span>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 app-muted-tile px-3 py-2">
        <span className="app-label">GPS source</span>
        <span className="truncate text-sm font-medium" style={{ color: hasGpsFeed && gpsFeedEnabled ? 'var(--success-800)' : 'var(--text-secondary)' }}>
          {hasGpsFeed ? (gpsFeedEnabled ? 'HTTP feed enabled' : 'HTTP feed disabled') : hasDevice ? 'Camera device only' : 'Not configured'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleOverview} className="app-button app-button-muted">
          <Camera className="h-4 w-4" />
          Overview
        </button>
        <button type="button" onClick={() => onEdit(vehicle)} className="app-button app-button-primary">
          <Edit3 className="h-4 w-4" />
          Edit
        </button>
        <button type="button" onClick={() => onShare(vehicle)} className="app-button app-button-secondary col-span-2">
          <Share2 className="h-4 w-4" />
          Share live location
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(vehicle)}
          className="app-button app-button-danger col-span-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </article>
  );
}
