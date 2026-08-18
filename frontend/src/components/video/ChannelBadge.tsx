import type { ChannelState } from '../../types';

interface ChannelBadgeProps {
  label: string;
  state: ChannelState;
}

const STATE_CLASS: Record<ChannelState, string> = {
  idle: 'bg-slate-800 text-slate-100',
  connecting: 'bg-blue-600 text-white',
  live: 'bg-emerald-600 text-white',
  degraded: 'bg-amber-500 text-white',
  reconnecting: 'bg-orange-600 text-white',
  offline: 'bg-red-600 text-white',
};

export default function ChannelBadge({ label, state }: ChannelBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${STATE_CLASS[state]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}