import { Search } from 'lucide-react';
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
    <div className="space-y-4 rounded-xl p-4 shadow-sm" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search plate or vehicle code"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as VehicleStatus | '')}
            className="app-select"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Type:</span>
        {TYPE_OPTIONS.map((option) => {
          const active = typeFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onTypeChange(option.value)}
              className="rounded-full px-3 py-1 text-sm font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: active ? 'var(--accent-600)' : 'var(--bg-tertiary)',
                color: active ? 'var(--text-inverse)' : 'var(--text-primary)'
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
