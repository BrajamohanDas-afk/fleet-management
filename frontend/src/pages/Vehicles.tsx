import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Layers3, Loader2, Plus, ShieldCheck, Trash2, Truck, X } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import VehicleCard from '../components/vehicles/VehicleCard';
import VehicleFilters from '../components/vehicles/VehicleFilters';
import VehicleForm from '../components/vehicles/VehicleForm';
import type { VehicleCreate, VehicleOut, VehicleUpdate } from '../services/vehicles';
import ShareModal from '../components/vehicles/ShareModal';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function needsRenewal(vehicle: VehicleOut): boolean {
  if (vehicle.license_status === 'expired') return true;
  if (!vehicle.license_expiry) return false;
  const expiry = new Date(vehicle.license_expiry).getTime();
  return expiry - Date.now() <= THIRTY_DAYS_MS;
}

function Counter({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: 'neutral' | 'success' | 'warning' | 'info' }) {
  const toneClass = {
    neutral: 'status-offline',
    success: 'status-moving',
    warning: 'status-stale',
    info: 'status-standing',
  }[tone];

  return (
    <div className="app-card app-hover-lift flex min-h-[5rem] items-center gap-3 p-4">
      <div className={`app-icon-box ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="app-label truncate">{label}</p>
        <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  );
}

function DeleteVehicleModal({
  vehicle,
  error,
  isPending,
  onCancel,
  onConfirm,
}: {
  vehicle: VehicleOut;
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-vehicle-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <div className="app-card app-animate-up w-full max-w-md p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="app-icon-box status-offline">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="delete-vehicle-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Delete vehicle
              </h2>
              <p className="mt-1 truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
                {vehicle.registration_no} / {vehicle.vehicle_code}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="app-button app-button-muted h-9 w-9 p-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          This will remove the vehicle from the fleet registry.
        </p>

        {error && (
          <p className="mt-4 rounded-lg p-3 text-sm font-medium" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="app-button app-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="app-button app-button-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Vehicles() {
  const {
    vehicles,
    isLoading,
    error,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  } = useVehicles();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formVehicle, setFormVehicle] = useState<VehicleOut | null>(null);
  const [shareVehicle, setShareVehicle] = useState<VehicleOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleOut | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const counters = useMemo(() => {
    const total = vehicles.length;
    const licensed = vehicles.filter((v) => v.license_status === 'valid').length;
    const renewal = vehicles.filter(needsRenewal).length;
    const types = new Set(vehicles.map((v) => v.vehicle_type)).size;
    return { total, licensed, renewal, types };
  }, [vehicles]);

  const handleAdd = () => {
    setFormVehicle(null);
    setIsFormOpen(true);
  };

  const handleEdit = (vehicle: VehicleOut) => {
    setFormVehicle(vehicle);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => setIsFormOpen(false);

  const handleSubmit = async ({ id, data }: { id?: number; data: VehicleCreate | VehicleUpdate }) => {
    if (id !== undefined) {
      await updateVehicle.mutateAsync({ id, data });
    } else {
      await createVehicle.mutateAsync(data as VehicleCreate);
    }
  };

  const handleRequestDelete = (vehicle: VehicleOut) => {
    setDeleteTarget(vehicle);
    setDeleteError(null);
  };

  const handleCancelDelete = () => {
    if (deleteVehicle.isPending) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteVehicle.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete vehicle.');
    }
  };

  return (
    <div className="app-page app-animate-in">
      <div className="app-page-inner space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="app-kicker mb-2">Fleet registry</p>
            <h1 className="app-title">Vehicles</h1>
          </div>
          <button type="button" onClick={handleAdd} className="app-button app-button-primary self-start lg:self-auto">
            <Plus className="h-4 w-4" />
            Add Vehicle
          </button>
        </div>

        <div className="app-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Counter label="Total" value={counters.total} icon={<Truck className="h-5 w-5" />} tone="neutral" />
          <Counter label="Licensed" value={counters.licensed} icon={<ShieldCheck className="h-5 w-5" />} tone="success" />
          <Counter label="Needs Renewal" value={counters.renewal} icon={<CalendarClock className="h-5 w-5" />} tone="warning" />
          <Counter label="Types" value={counters.types} icon={<Layers3 className="h-5 w-5" />} tone="info" />
        </div>

        <VehicleFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
        />

        {isLoading && (
          <div className="app-card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading vehicles...
          </div>
        )}

        {error && (
          <div className="app-card status-offline p-4 text-sm font-medium">
            Failed to load vehicles: {error.message}
          </div>
        )}

        {!isLoading && !error && vehicles.length === 0 && (
          <div className="app-card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            No vehicles match your filters.
          </div>
        )}

        {!isLoading && !error && vehicles.length > 0 && (
          <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onEdit={handleEdit}
                onRequestDelete={handleRequestDelete}
                onShare={setShareVehicle}
              />
            ))}
          </div>
        )}
      </div>

      {isFormOpen && (
        <VehicleForm
          vehicle={formVehicle}
          onClose={handleCloseForm}
          onSubmit={handleSubmit}
          isPending={createVehicle.isPending || updateVehicle.isPending}
        />
      )}
      {shareVehicle && (
        <ShareModal vehicle={shareVehicle} onClose={() => setShareVehicle(null)} />
      )}
      {deleteTarget && (
        <DeleteVehicleModal
          vehicle={deleteTarget}
          error={deleteError}
          isPending={deleteVehicle.isPending}
          onCancel={handleCancelDelete}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
