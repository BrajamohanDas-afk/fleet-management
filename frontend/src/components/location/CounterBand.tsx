import { Eye, Navigation, ParkingSquare, CalendarClock } from 'lucide-react';
import type { VehicleStatus } from '../../types';

interface CounterBandProps {
  visible: number;
  running: number;
  stationary: number;
  needsRenewal: number;
}

interface CounterItemProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColorClass: string;
}

function CounterItem({ icon, label, value, iconColorClass }: CounterItemProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div
        className={[
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
          iconColorClass,
        ].join(' ')}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
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
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <CounterItem
        icon={<Eye className="h-6 w-6 text-slate-600" />}
        label="Visible"
        value={visible}
        iconColorClass="bg-slate-100"
      />
      <CounterItem
        icon={<Navigation className="h-6 w-6 text-emerald-600" />}
        label="Running"
        value={running}
        iconColorClass="bg-emerald-100"
      />
      <CounterItem
        icon={<ParkingSquare className="h-6 w-6 text-blue-600" />}
        label="Stationary"
        value={stationary}
        iconColorClass="bg-blue-100"
      />
      <CounterItem
        icon={<CalendarClock className="h-6 w-6 text-amber-600" />}
        label="Needs Renewal"
        value={needsRenewal}
        iconColorClass="bg-amber-100"
      />
    </div>
  );
}

export function countByStatus(
  positions: { status: VehicleStatus }[],
  status: VehicleStatus
): number {
  return positions.filter((position) => position.status === status).length;
}
