import { useMemo, useState } from 'react';
import { Radio, Search, Eye, EyeOff } from 'lucide-react';
import type { LatLngExpression } from 'leaflet';
import { useFleetPositions } from '../hooks/useFleetPositions';
import { useAllVehicles } from '../hooks/useAllVehicles';
import CounterBand, { countByStatus } from '../components/location/CounterBand';
import MapView from '../components/location/MapView';
import VehicleCardRail from '../components/location/VehicleCardRail';
import type { FleetPosition, VehicleStatus } from '../types';
import type { VehicleOut } from '../services/vehicles';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STATUS_FILTER_OPTIONS: { value: VehicleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'moving', label: 'Running' },
  { value: 'standing', label: 'Stationary' },
];

function needsRenewal(vehicle: VehicleOut): boolean {
  if (vehicle.license_status === 'expired') return true;
  if (!vehicle.license_expiry) return false;
  const expiry = new Date(vehicle.license_expiry).getTime();
  return expiry - Date.now() <= THIRTY_DAYS_MS;
}

function enrichPositions(
  positions: FleetPosition[],
  vehicles: VehicleOut[]
): FleetPosition[] {
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return positions.map((position) => {
    const vehicle = vehicleMap.get(position.vehicle_id);
    if (!vehicle) return position;
    return {
      ...position,
      sim_number: vehicle.latest?.sim_number ?? position.sim_number,
      license_status: vehicle.license_status,
      license_expiry: vehicle.license_expiry,
    };
  });
}

export default function VehicleLocation() {
  const { positions: rawPositions, isLoading, error, isConnected } = useFleetPositions();
  const { vehicles: allVehicles } = useAllVehicles();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('');
  const [showLabels, setShowLabels] = useState(false);
  const [focusTarget, setFocusTarget] = useState<LatLngExpression | null>(null);

  const positions = useMemo(
    () => enrichPositions(rawPositions, allVehicles),
    [rawPositions, allVehicles]
  );

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return positions.filter((position) => {
      const matchesSearch =
        !q ||
        position.registration_no.toLowerCase().includes(q) ||
        position.vehicle_code.toLowerCase().includes(q);
      const matchesStatus =
        !statusFilter || position.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [positions, search, statusFilter]);

  const counters = useMemo(() => {
    return {
      visible: filteredPositions.length,
      running: countByStatus(filteredPositions, 'moving'),
      stationary: countByStatus(filteredPositions, 'standing'),
      needsRenewal: allVehicles.filter(needsRenewal).length,
    };
  }, [filteredPositions, allVehicles]);

  const handleTrack = (position: FleetPosition) => {
    if (position.latitude == null || position.longitude == null) return;
    setFocusTarget([position.latitude, position.longitude]);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header + counters */}
      <div className="shrink-0 space-y-4 p-4">
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Vehicle Location
            </h1>
            <p className="text-sm text-slate-500">
              Live fleet map and tracking
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={[
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                isConnected
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600',
              ].join(' ')}
              title={
                isConnected
                  ? 'Live position feed connected'
                  : 'Live position feed disconnected'
              }
            >
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  isConnected ? 'bg-emerald-500' : 'bg-slate-400',
                ].join(' ')}
              />
              <Radio className="h-4 w-4" />
              {isConnected ? 'Live Feed' : 'Feed Offline'}
            </div>
          </div>
        </div>

        <CounterBand
          visible={counters.visible}
          running={counters.running}
          stationary={counters.stationary}
          needsRenewal={counters.needsRenewal}
        />
      </div>

      {/* Main content: rail + map */}
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4">
        {/* Left rail */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-hidden rounded-xl bg-white p-4 shadow-sm">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search plate or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Status radio filters */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Status
              </p>
              <div className="flex flex-col gap-2">
                {STATUS_FILTER_OPTIONS.map((option) => {
                  const active = statusFilter === option.value;
                  return (
                    <label
                      key={option.value || 'all'}
                      className={[
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="status-filter"
                        value={option.value}
                        checked={active}
                        onChange={() => setStatusFilter(option.value)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Show labels toggle */}
            <button
              type="button"
              onClick={() => setShowLabels((prev) => !prev)}
              className={[
                'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                showLabels
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {showLabels ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              Show Popup Labels
            </button>
          </div>

          {/* Cards */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoading && filteredPositions.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">
                Loading vehicles…
              </p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                Failed to load positions: {error.message}
              </p>
            )}
            <VehicleCardRail
              positions={filteredPositions}
              onTrack={handleTrack}
            />
          </div>
        </aside>

        {/* Map */}
        <main className="min-h-0 flex-1">
          <MapView
            positions={filteredPositions}
            showPermanentLabels={showLabels}
            focusTarget={focusTarget}
          />
        </main>
      </div>
    </div>
  );
}
