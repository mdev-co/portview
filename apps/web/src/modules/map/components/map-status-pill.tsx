import { cn } from '@/lib/utils';
import type { MapStatus } from '../core/map-state';
import { useMapState } from '../hooks/use-map-state';

const STATUS_LABEL: Record<MapStatus, string> = {
  idle: 'Idle',
  attached: 'Idle',
  initializing: 'Loading',
  ready: 'Live',
  swapping: 'Switching',
  error: 'Error',
  disposing: 'Stopping',
  disposed: 'Stopped',
};

const STATUS_DOT: Record<MapStatus, string> = {
  idle: 'bg-slate-500',
  attached: 'bg-slate-500',
  initializing: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-400',
  swapping: 'bg-amber-400 animate-pulse',
  error: 'bg-rose-500',
  disposing: 'bg-slate-700',
  disposed: 'bg-slate-700',
};

export function MapStatusPill() {
  const { status } = useMapState();

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
