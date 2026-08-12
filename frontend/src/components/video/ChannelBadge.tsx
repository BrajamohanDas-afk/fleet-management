import type { ChannelState } from '../../types';

interface ChannelBadgeProps {
  label: string;
  state: ChannelState;
}

const STATE_COLORS: Record<ChannelState, string> = {
  idle: 'bg-slate-700 text-slate-100',
  connecting: 'bg-blue-600 text-white',
  live: 'bg-emerald-600 text-white',
  degraded: 'bg-amber-500 text-white',
  reconnecting: 'bg-orange-600 text-white',
  offline: 'bg-red-600 text-white',
};

export default function ChannelBadge({ label, state }: ChannelBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        STATE_COLORS[state],
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
