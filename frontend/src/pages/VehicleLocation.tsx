import { useMemo, useState } from 'react';
import { Eye, EyeOff, Radio, Search } from 'lucide-react';
import { useFleetPositions } from '../hooks/useFleetPositions';
import { useAllVehicles } from '../hooks/useAllVehicles';
import CounterBand, { countByStatus } from '../components/location/CounterBand';
import MapView from '../components/location/MapView';
import VehicleCardRail from '../components/location/VehicleCardRail';
import type { MapCoordinate } from '../constants/map';
import type { FleetPosition, VehicleStatus } from '../types';
import type { VehicleOut } from '../services/vehicles';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STATUS_FILTER_OPTIONS: { value: VehicleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'moving', label: 'Running' },
  { value: 'standing', label: 'Stationary' },
  { value: 'stale', label: 'Stale' },
  { value: 'offline', label: 'Offline' },
];

function needsRenewal(vehicle: VehicleOut): boolean {
  if (vehicle.license_status === 'expired') return true;
  if (!vehicle.license_expiry) return false;
  const expiry = new Date(vehicle.license_expiry).getTime();
  return expiry - Date.now() <= THIRTY_DAYS_MS;
}

function enrichPositions(positions: FleetPosition[], vehicles: VehicleOut[]): FleetPosition[] {
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
  const [focusTarget, setFocusTarget] = useState<MapCoordinate | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const positions = useMemo(() => enrichPositions(rawPositions, allVehicles), [rawPositions, allVehicles]);

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return positions.filter((position) => {
      const matchesSearch = !q || position.registration_no.toLowerCase().includes(q) || position.vehicle_code.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || position.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [positions, search, statusFilter]);

  const selectedPosition = useMemo(() => {
    return filteredPositions.find((position) => position.vehicle_id === selectedVehicleId) ?? filteredPositions[0] ?? null;
  }, [filteredPositions, selectedVehicleId]);

  const counters = useMemo(() => {
    return {
      visible: filteredPositions.length,
      running: countByStatus(filteredPositions, 'moving'),
      stationary: countByStatus(filteredPositions, 'standing'),
      needsRenewal: allVehicles.filter(needsRenewal).length,
    };
  }, [filteredPositions, allVehicles]);

  const handleSelect = (position: FleetPosition) => {
    setSelectedVehicleId(position.vehicle_id);
  };

  const handleTrack = (position: FleetPosition) => {
    setSelectedVehicleId(position.vehicle_id);
    if (position.latitude == null || position.longitude == null) return;
    setFocusTarget([position.latitude, position.longitude]);
  };

  return (
    <div className="app-page app-animate-in flex flex-col">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="app-kicker mb-2">Live tracking</p>
            <h1 className="app-title">Vehicle Location</h1>
          </div>

          <div
            className={`app-chip ${isConnected ? 'status-moving' : 'status-offline'}`}
            title={isConnected ? 'Live position feed connected' : 'Live position feed disconnected'}
          >
            <span className={`app-status-dot ${isConnected ? 'app-live-dot dot-moving' : 'dot-offline'}`} />
            <Radio className="h-4 w-4" />
            {isConnected ? 'Live Feed' : 'Feed Offline'}
          </div>
        </div>

        <CounterBand
          visible={counters.visible}
          running={counters.running}
          stationary={counters.stationary}
          needsRenewal={counters.needsRenewal}
        />
      </div>

      <div className="mt-4 grid min-h-[42rem] flex-1 grid-cols-1 gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className="app-card flex min-h-[34rem] flex-col overflow-hidden p-4">
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search plate or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="app-input w-full pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTER_OPTIONS.map((option) => {
                const active = statusFilter === option.value;
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`app-chip ${active ? 'app-chip-active' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowLabels((prev) => !prev)}
              className={`app-button w-full ${showLabels ? 'app-button-primary' : 'app-button-secondary'}`}
            >
              {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Popup Labels
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoading && filteredPositions.length === 0 && (
              <p className="py-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading vehicles...</p>
            )}
            {error && (
              <p className="app-card mb-3 p-3 text-sm" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
                Failed to load positions: {error.message}
              </p>
            )}
            <VehicleCardRail
              positions={filteredPositions}
              selectedVehicleId={selectedPosition?.vehicle_id ?? null}
              onSelect={handleSelect}
              onTrack={handleTrack}
            />
          </div>
        </aside>

        <main className="min-h-[34rem]">
          <MapView
            positions={filteredPositions}
            showPermanentLabels={showLabels}
            focusTarget={focusTarget}
            onSelectVehicle={handleSelect}
          />
        </main>
      </div>
    </div>
  );
}