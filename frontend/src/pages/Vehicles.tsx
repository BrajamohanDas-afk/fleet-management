import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import VehicleCard from '../components/vehicles/VehicleCard';
import VehicleFilters from '../components/vehicles/VehicleFilters';
import VehicleForm from '../components/vehicles/VehicleForm';
import type { VehicleCreate, VehicleOut, VehicleUpdate } from '../services/vehicles';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function needsRenewal(vehicle: VehicleOut): boolean {
  if (vehicle.license_status === 'expired') return true;
  if (!vehicle.license_expiry) return false;
  const expiry = new Date(vehicle.license_expiry).getTime();
  return expiry - Date.now() <= THIRTY_DAYS_MS;
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
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
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      await deleteVehicle.mutateAsync(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vehicles</h1>
            <p className="text-sm text-slate-500">
              Manage your fleet registry
            </p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
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
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
            Loading vehicles…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Failed to load vehicles: {error.message}
          </div>
        )}

        {!isLoading && !error && vehicles.length === 0 && (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
            No vehicles match your filters.
          </div>
        )}

        {!isLoading && !error && vehicles.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="relative">
                <VehicleCard vehicle={vehicle} onEdit={handleEdit} />
                <button
                  type="button"
                  onClick={() => handleDelete(vehicle.id)}
                  disabled={deleteVehicle.isPending}
                  className="absolute right-2 top-2 text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
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
    </div>
  );
}
