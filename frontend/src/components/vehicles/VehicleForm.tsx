import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type {
  VehicleCreate,
  VehicleOut,
  VehicleUpdate,
} from '../../services/vehicles';
import type { LicenseStatus, VehicleType } from '../../types';

const VEHICLE_TYPES: VehicleType[] = ['bike', 'car', 'truck', 'bus', 'other'];
const LICENSE_STATUSES: LicenseStatus[] = [
  'valid',
  'expired',
  'pending',
  'suspended',
];

interface VehicleFormProps {
  vehicle: VehicleOut | null;
  onClose: () => void;
  onSubmit: (payload: { id?: number; data: VehicleCreate | VehicleUpdate }) => Promise<void>;
  isPending: boolean;
}

export default function VehicleForm({
  vehicle,
  onClose,
  onSubmit,
  isPending,
}: VehicleFormProps) {
  const isEdit = vehicle !== null;
  const [registrationNo, setRegistrationNo] = useState('');
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [speedLimit, setSpeedLimit] = useState('');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>('valid');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vehicle) {
      setRegistrationNo(vehicle.registration_no);
      setVehicleCode(vehicle.vehicle_code);
      setVehicleType(vehicle.vehicle_type);
      setSpeedLimit(
        vehicle.speed_limit_kmh !== null ? String(vehicle.speed_limit_kmh) : ''
      );
      setLicenseStatus(vehicle.license_status);
      setLicenseExpiry(vehicle.license_expiry ?? '');
    } else {
      setRegistrationNo('');
      setVehicleCode('');
      setVehicleType('car');
      setSpeedLimit('');
      setLicenseStatus('valid');
      setLicenseExpiry('');
    }
  }, [vehicle]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const data: VehicleCreate = {
      registration_no: registrationNo.trim(),
      vehicle_code: vehicleCode.trim(),
      vehicle_type: vehicleType,
      speed_limit_kmh: speedLimit.trim() === '' ? null : Number(speedLimit),
      license_status: licenseStatus,
      license_expiry: licenseExpiry.trim() === '' ? null : licenseExpiry,
    };

    try {
      await onSubmit({ id: vehicle?.id, data });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save vehicle.';
      setError(message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-form-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="vehicle-form-title"
            className="text-lg font-semibold text-slate-900"
          >
            {isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="registration_no"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Registration number
            </label>
            <input
              id="registration_no"
              type="text"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="vehicle_code"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Vehicle code
            </label>
            <input
              id="vehicle_code"
              type="text"
              value={vehicleCode}
              onChange={(e) => setVehicleCode(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="vehicle_type"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Vehicle type
            </label>
            <select
              id="vehicle_type"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="speed_limit"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Speed limit (km/h)
            </label>
            <input
              id="speed_limit"
              type="number"
              min={0}
              value={speedLimit}
              onChange={(e) => setSpeedLimit(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="license_status"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              License status
            </label>
            <select
              id="license_status"
              value={licenseStatus}
              onChange={(e) =>
                setLicenseStatus(e.target.value as LicenseStatus)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {LICENSE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="license_expiry"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              License expiry
            </label>
            <input
              id="license_expiry"
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
