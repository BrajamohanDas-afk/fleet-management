import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import VehicleCard from '../components/vehicles/VehicleCard';
import VehicleFilters from '../components/vehicles/VehicleFilters';
import VehicleForm from '../components/vehicles/VehicleForm';
import type { VehicleCreate, VehicleOut, VehicleUpdate } from '../services/vehicles';
import ShareModal from '../components/vehicles/ShareModal';
import TrackingLinkModal from '../components/vehicles/TrackingLinkModal';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function needsRenewal(vehicle: VehicleOut): boolean {
  if (vehicle.license_status === 'expired') return true;
  if (!vehicle.license_expiry) return false;
  const expiry = new Date(vehicle.license_expiry).getTime();
  return expiry - Date.now() <= THIRTY_DAYS_MS;
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
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
  const [trackingVehicle, setTrackingVehicle] = useState<VehicleOut | null>(null);

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

  const handleSubmit = async ({
    id,
    data,
  }: {
    id?: number;
    data: VehicleCreate | VehicleUpdate;
  }) => {
    if (id !== undefined) {
      await updateVehicle.mutateAsync({ id, data });
    } else {
      await createVehicle.mutateAsync(data as VehicleCreate);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteVehicle.mutateAsync(id);
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Vehicles</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Manage your fleet registry
            </p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-80"
            style={{ backgroundColor: 'var(--accent-600)', color: 'var(--text-inverse)' }}
          >
            <Plus className="h-4 w-4" />
            Add Vehicle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Counter label="Total" value={counters.total} />
          <Counter label="Licensed" value={counters.licensed} />
          <Counter label="Needs Renewal" value={counters.renewal} />
          <Counter label="Types" value={counters.types} />
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
          <div className="rounded-xl p-8 text-center shadow-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Loading vehicles…
          </div>
        )}

        {error && (
          <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
            Failed to load vehicles: {error.message}
          </div>
        )}

        {!isLoading && !error && vehicles.length === 0 && (
          <div className="rounded-xl p-8 text-center shadow-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            No vehicles match your filters.
          </div>
        )}

        {!isLoading && !error && vehicles.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShare={setShareVehicle}
                onTrack={setTrackingVehicle}
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
      {shareVehicle && <ShareModal vehicle={shareVehicle} onClose={() => setShareVehicle(null)} />}
      {trackingVehicle && (
        <TrackingLinkModal
          vehicle={trackingVehicle}
          onClose={() => setTrackingVehicle(null)}
        />
      )}
    </div>
  );
}
