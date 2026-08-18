import { Search, SlidersHorizontal } from 'lucide-react';
import type { VehicleStatus, VehicleType } from '../../types';

const STATUS_OPTIONS: { value: VehicleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'moving', label: 'Running' },
  { value: 'standing', label: 'Stationary' },
  { value: 'stale', label: 'Stale' },
  { value: 'offline', label: 'Offline' },
];

const TYPE_OPTIONS: { value: VehicleType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'bike', label: 'Bike' },
  { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' },
  { value: 'bus', label: 'Bus' },
  { value: 'other', label: 'Other' },
];

interface VehicleFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: VehicleStatus | '';
  onStatusChange: (value: VehicleStatus | '') => void;
  typeFilter: VehicleType | '';
  onTypeChange: (value: VehicleType | '') => void;
}

export default function VehicleFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
}: VehicleFiltersProps) {
  return (
    <div className="app-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search plate or vehicle code"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="app-input w-full pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as VehicleStatus | '')}
            className="app-select"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TYPE_OPTIONS.map((option) => {
          const active = typeFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onTypeChange(option.value)}
              className={`app-chip ${active ? 'app-chip-active' : ''}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}