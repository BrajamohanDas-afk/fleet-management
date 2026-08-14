import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  Eye,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  VehicleCreate,
  VehicleOut,
  VehicleUpdate,
  getVehicleCameras,
  testRtspUrl,
} from '../../services/vehicles';
import type { LicenseStatus, VehicleType } from '../../types';

const VEHICLE_TYPES: VehicleType[] = ['bike', 'car', 'truck', 'bus', 'other'];
const LICENSE_STATUSES: LicenseStatus[] = [
  'valid',
  'expired',
  'pending',
  'suspended',
];
const CAMERA_ANGLES = ['Front', 'Rear', 'Cabin', 'Left', 'Right', 'Cargo'];
const INPUT_CLASS = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';
const COMPACT_INPUT_CLASS = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';
const FIELD_STYLE = {
  backgroundColor: 'var(--bg-primary)',
  borderColor: 'var(--border-secondary)',
  color: 'var(--text-primary)',
};

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface CameraInput {
  channel_no: number;
  label: string;
  rtsp_url: string;
}

interface VehicleFormProps {
  vehicle: VehicleOut | null;
  onClose: () => void;
  onSubmit: (payload: { id?: number; data: VehicleCreate | VehicleUpdate }) => Promise<void>;
  isPending: boolean;
}

function formatOptionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function summarizeRtspUrl(rtspUrl: string): string {
  const trimmed = rtspUrl.trim();
  if (!trimmed) return 'No RTSP URL configured';
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return trimmed;
  }
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
  const [deviceSerial, setDeviceSerial] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [cameras, setCameras] = useState<CameraInput[]>([]);
  const [editingCameraIndex, setEditingCameraIndex] = useState<number | null>(null);
  const [camerasLoaded, setCamerasLoaded] = useState(true);
  const [cameraLoadError, setCameraLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestStatus>>({});
  const [testMessages, setTestMessages] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;

    setError(null);
    setCameraLoadError(null);
    setEditingCameraIndex(null);
    setTestResults({});
    setTestMessages({});

    if (vehicle) {
      setRegistrationNo(vehicle.registration_no);
      setVehicleCode(vehicle.vehicle_code);
      setVehicleType(vehicle.vehicle_type);
      setSpeedLimit(
        vehicle.speed_limit_kmh !== null ? String(vehicle.speed_limit_kmh) : ''
      );
      setLicenseStatus(vehicle.license_status);
      setLicenseExpiry(vehicle.license_expiry ?? '');
      setDeviceSerial(vehicle.device_serial ?? vehicle.latest?.device_serial ?? '');
      setSimNumber(vehicle.sim_number ?? vehicle.latest?.sim_number ?? '');

      const deviceId = vehicle.device_id || vehicle.latest?.device_id;
      if (deviceId) {
        setCamerasLoaded(false);
        getVehicleCameras(deviceId)
          .then((cams) => {
            if (cancelled) return;
            setCameras(
              cams.map((camera) => ({
                channel_no: camera.channel_no,
                label: camera.label,
                rtsp_url: camera.rtsp_url || '',
              }))
            );
            setCamerasLoaded(true);
          })
          .catch(() => {
            if (cancelled) return;
            setCameras([]);
            setCamerasLoaded(false);
            setCameraLoadError('Could not load existing camera sources. Close and reopen the form, then try again.');
          });
      } else {
        setCameras([]);
        setCamerasLoaded(true);
      }
    } else {
      setRegistrationNo('');
      setVehicleCode('');
      setVehicleType('car');
      setSpeedLimit('');
      setLicenseStatus('valid');
      setLicenseExpiry('');
      setDeviceSerial('');
      setSimNumber('');
      setCameras([]);
      setCamerasLoaded(true);
    }

    return () => {
      cancelled = true;
    };
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

  const configuredCameras = cameras.filter((camera) => camera.rtsp_url.trim());
  const existingDeviceId = vehicle ? (vehicle.device_id ?? vehicle.latest?.device_id ?? null) : null;
  const showDeviceFields = isEdit || cameras.length > 0 || Boolean(deviceSerial.trim() || simNumber.trim());

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isEdit && !camerasLoaded) {
      setError('Existing camera sources are still loading or failed to load. Please reopen the form before saving.');
      return;
    }

    if (configuredCameras.length > 0 && (!deviceSerial.trim() || !simNumber.trim())) {
      setError('Device serial and SIM number are required when adding cameras.');
      return;
    }

    if (configuredCameras.some((camera) => camera.channel_no < 1 || !Number.isInteger(camera.channel_no))) {
      setError('Camera channel numbers must be whole numbers greater than 0.');
      return;
    }

    const channelNumbers = configuredCameras.map((camera) => camera.channel_no);
    if (new Set(channelNumbers).size !== channelNumbers.length) {
      setError('Each camera channel number must be unique.');
      return;
    }

    if (configuredCameras.some((camera) => !camera.rtsp_url.trim().toLowerCase().startsWith('rtsp://'))) {
      setError('Every camera URL must start with rtsp://');
      return;
    }

    const cameraPayload = configuredCameras.map((camera) => ({
      channel_no: camera.channel_no,
      label: camera.label.trim() || `Camera ${camera.channel_no}`,
      rtsp_url: camera.rtsp_url.trim(),
    }));

    const data: VehicleCreate = {
      registration_no: registrationNo.trim(),
      vehicle_code: vehicleCode.trim(),
      vehicle_type: vehicleType,
      speed_limit_kmh: speedLimit.trim() === '' ? null : Number(speedLimit),
      license_status: licenseStatus,
      license_expiry: licenseExpiry.trim() === '' ? null : licenseExpiry,
      device: configuredCameras.length === 0 ? null : {
        device_serial: deviceSerial.trim(),
        sim_number: simNumber.trim(),
        protocol: 'other',
        cameras: cameraPayload,
      },
    };

    if (isEdit && (showDeviceFields || existingDeviceId)) {
      data.device = {
        device_serial: deviceSerial.trim(),
        sim_number: simNumber.trim(),
        protocol: 'other',
        cameras: cameraPayload,
      };
    }

    try {
      const vehicleData: VehicleUpdate = { ...data };
      await onSubmit({ id: vehicle?.id, data: isEdit ? vehicleData : data });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save vehicle.';
      setError(message);
    }
  };

  const addCamera = () => {
    const channelNo = Math.max(0, ...cameras.map((camera) => camera.channel_no)) + 1;
    const nextIndex = cameras.length;
    setCameras((current) => [...current, { channel_no: channelNo, label: 'Front', rtsp_url: '' }]);
    setEditingCameraIndex(nextIndex);
  };

  const updateCamera = (index: number, patch: Partial<CameraInput>) => {
    setCameras((current) => current.map((camera, cameraIndex) =>
      cameraIndex === index ? { ...camera, ...patch } : camera
    ));
    if (patch.rtsp_url !== undefined) {
      setTestResults((prev) => ({ ...prev, [index]: 'idle' }));
      setTestMessages((prev) => ({ ...prev, [index]: '' }));
    }
  };

  const removeCamera = (index: number) => {
    setCameras((current) => current.filter((_, cameraIndex) => cameraIndex !== index));
    setEditingCameraIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
    setTestResults({});
    setTestMessages({});
  };

  const handleTestCamera = async (index: number) => {
    const cam = cameras[index];
    if (!cam.rtsp_url.trim()) {
      setTestResults((prev) => ({ ...prev, [index]: 'error' }));
      setTestMessages((prev) => ({ ...prev, [index]: 'Enter an RTSP URL before testing.' }));
      setEditingCameraIndex(index);
      return;
    }

    setTestResults((prev) => ({ ...prev, [index]: 'testing' }));
    setTestMessages((prev) => ({ ...prev, [index]: '' }));
    try {
      const res = await testRtspUrl(cam.rtsp_url, vehicle?.id);
      setTestResults((prev) => ({ ...prev, [index]: res.status === 'ok' ? 'ok' : 'error' }));
      setTestMessages((prev) => ({ ...prev, [index]: res.detail || (res.status === 'ok' ? 'Connected' : 'Connection failed') }));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      setTestResults((prev) => ({ ...prev, [index]: 'error' }));
      setTestMessages((prev) => ({ ...prev, [index]: typeof detail === 'string' ? detail : 'Camera test failed' }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-form-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5">
          <h2 id="vehicle-form-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label htmlFor="registration_no" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Registration number
            </label>
            <input
              id="registration_no"
              type="text"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
              required
              className={INPUT_CLASS}
              style={FIELD_STYLE}
            />
          </div>

          <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <Camera className="h-4 w-4" style={{ color: 'var(--accent-600)' }} /> Camera sources
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Add each DVR RTSP sub-stream. Existing cameras can be edited directly below.
                </p>
              </div>
              <button
                type="button"
                onClick={addCamera}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:opacity-80"
                style={{ backgroundColor: 'var(--accent-600)', borderColor: 'var(--accent-600)', color: 'var(--text-inverse)' }}
              >
                <Plus className="h-3.5 w-3.5" /> Add camera
              </button>
            </div>

            {showDeviceFields && (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Device serial
                  </label>
                  <input
                    value={deviceSerial}
                    onChange={(e) => setDeviceSerial(e.target.value)}
                    className={COMPACT_INPUT_CLASS}
                    style={FIELD_STYLE}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    SIM number
                  </label>
                  <input
                    value={simNumber}
                    onChange={(e) => setSimNumber(e.target.value)}
                    className={COMPACT_INPUT_CLASS}
                    style={FIELD_STYLE}
                  />
                </div>
              </div>
            )}

            {cameraLoadError && (
              <div className="mb-3 rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-700)' }}>
                {cameraLoadError}
              </div>
            )}

            {!camerasLoaded && !cameraLoadError && (
              <div className="rounded-lg border p-3 text-sm" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
                Loading camera sources...
              </div>
            )}

            {camerasLoaded && cameras.length === 0 && (
              <div className="rounded-lg border p-3 text-sm" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
                No cameras configured. Use Add camera to add a Front, Rear, or Cabin RTSP stream.
              </div>
            )}

            <div className="space-y-4">
              {cameras.map((camera, index) => {
                const status = testResults[index] || 'idle';
                const isEditing = editingCameraIndex === index;
                return (
                  <div key={`${camera.channel_no}-${index}`} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          CH{camera.channel_no} - {camera.label || 'Camera'}
                        </p>
                        <p className="mt-1 truncate text-xs" style={{ color: camera.rtsp_url.trim() ? 'var(--text-secondary)' : 'var(--danger-700)' }}>
                          {summarizeRtspUrl(camera.rtsp_url)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleTestCamera(index)}
                          title="Test camera"
                          className="flex h-8 w-8 items-center justify-center rounded-md border hover:opacity-80"
                          style={{
                            backgroundColor: status === 'ok' ? 'var(--success-100)' : status === 'error' ? 'var(--danger-50)' : 'var(--bg-tertiary)',
                            borderColor: status === 'ok' ? 'var(--success-800)' : status === 'error' ? 'var(--danger-600)' : 'var(--border-secondary)',
                            color: status === 'ok' ? 'var(--success-800)' : status === 'error' ? 'var(--danger-700)' : 'var(--text-secondary)',
                          }}
                        >
                          {status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> :
                            status === 'ok' ? <Check className="h-4 w-4" /> :
                              status === 'error' ? <AlertCircle className="h-4 w-4" /> :
                                <Search className="h-4 w-4" />}
                        </button>
                        {vehicle && (
                          <a
                            href={`/dashboard/video?vehicleId=${vehicle.id}&channelNo=${camera.channel_no}&autostart=1`}
                            onClick={onClose}
                            className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:opacity-80"
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingCameraIndex(isEditing ? null : index)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:opacity-80"
                          style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}
                        >
                          {isEditing ? <Check className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          aria-label="Remove camera"
                          onClick={() => removeCamera(index)}
                          className="rounded-md p-1.5 hover:opacity-80"
                          style={{ color: 'var(--danger-600)' }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5rem_1fr]">
                          <input
                            aria-label={`Channel ${index + 1}`}
                            type="number"
                            min={1}
                            value={camera.channel_no}
                            onChange={(e) => updateCamera(index, { channel_no: Number(e.target.value) })}
                            className={COMPACT_INPUT_CLASS}
                            style={FIELD_STYLE}
                          />
                          <select
                            aria-label={`Camera angle ${index + 1}`}
                            value={camera.label}
                            onChange={(e) => updateCamera(index, { label: e.target.value })}
                            className="app-select w-full"
                          >
                            {CAMERA_ANGLES.map((angle) => (
                              <option key={angle} value={angle}>{angle}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          aria-label={`${camera.label} RTSP URL`}
                          type="text"
                          inputMode="url"
                          placeholder="rtsp://user:password@camera-host:554/substream"
                          value={camera.rtsp_url}
                          onChange={(e) => updateCamera(index, { rtsp_url: e.target.value })}
                          className={INPUT_CLASS}
                          style={FIELD_STYLE}
                        />
                      </div>
                    )}

                    {testMessages[index] && (
                      <p className="mt-2 text-xs" style={{ color: status === 'ok' ? 'var(--success-800)' : 'var(--danger-700)' }}>
                        {testMessages[index]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="vehicle_code" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Vehicle code
            </label>
            <input
              id="vehicle_code"
              type="text"
              value={vehicleCode}
              onChange={(e) => setVehicleCode(e.target.value)}
              required
              className={INPUT_CLASS}
              style={FIELD_STYLE}
            />
          </div>

          <div>
            <label htmlFor="vehicle_type" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Vehicle type
            </label>
            <select
              id="vehicle_type"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              className="app-select w-full"
            >
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>{formatOptionLabel(type)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="speed_limit" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Speed limit (km/h)
            </label>
            <input
              id="speed_limit"
              type="number"
              min={0}
              value={speedLimit}
              onChange={(e) => setSpeedLimit(e.target.value)}
              className={INPUT_CLASS}
              style={FIELD_STYLE}
            />
          </div>

          <div>
            <label htmlFor="license_status" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              License status
            </label>
            <select
              id="license_status"
              value={licenseStatus}
              onChange={(e) => setLicenseStatus(e.target.value as LicenseStatus)}
              className="app-select w-full"
            >
              {LICENSE_STATUSES.map((status) => (
                <option key={status} value={status}>{formatOptionLabel(status)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="license_expiry" className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              License expiry
            </label>
            <input
              id="license_expiry"
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className={INPUT_CLASS}
              style={FIELD_STYLE}
            />
          </div>

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-700)' }}>
              {error}
            </div>
          )}

          <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t px-6 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent-600)', color: 'var(--text-inverse)' }}
            >
              {isPending ? 'Saving...' : isEdit ? 'Update Vehicle' : 'Create Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}