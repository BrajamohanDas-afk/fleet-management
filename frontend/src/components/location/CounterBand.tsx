import type { ReactNode } from 'react';
import { CalendarClock, Eye, Navigation, ParkingSquare } from 'lucide-react';
import type { VehicleStatus } from '../../types';

interface CounterBandProps {
  visible: number;
  running: number;
  stationary: number;
  needsRenewal: number;
}

interface CounterItemProps {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'info' | 'warning';
}

const TONE_CLASS: Record<CounterItemProps['tone'], string> = {
  neutral: 'status-offline',
  success: 'status-moving',
  info: 'status-standing',
  warning: 'status-stale',
};

function CounterItem({ icon, label, value, tone }: CounterItemProps) {
  return (
    <div className="app-card app-hover-lift flex min-h-[5rem] items-center gap-3 p-4">
      <div className={`app-icon-box ${TONE_CLASS[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="app-label truncate">{label}</p>
        <p className="text-2xl font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  );
}

export default function CounterBand({
  visible,
  running,
  stationary,
  needsRenewal,
}: CounterBandProps) {
  return (
    <div className="app-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CounterItem icon={<Eye className="h-5 w-5" />} label="Visible" value={visible} tone="neutral" />
      <CounterItem icon={<Navigation className="h-5 w-5" />} label="Running" value={running} tone="success" />
      <CounterItem icon={<ParkingSquare className="h-5 w-5" />} label="Stationary" value={stationary} tone="info" />
      <CounterItem icon={<CalendarClock className="h-5 w-5" />} label="Needs Renewal" value={needsRenewal} tone="warning" />
    </div>
  );
}

export function countByStatus(
  positions: { status: VehicleStatus }[],
  status: VehicleStatus
): number {
  return positions.filter((position) => position.status === status).length;
}