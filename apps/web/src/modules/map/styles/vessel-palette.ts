export const VESSEL_STATUS = {
  underway: 'underway',
  anchored: 'anchored',
  stopped: 'stopped',
  nuc: 'nuc',
} as const;

export type VesselStatus = (typeof VESSEL_STATUS)[keyof typeof VESSEL_STATUS];

export const VESSEL_PALETTE = {
  underway: {
    hex: '#34d399',
    dot: 'bg-emerald-400 ring-emerald-400/30',
    text: 'text-emerald-500 dark:text-emerald-400',
    border: 'border-emerald-400/40',
  },
  anchored: {
    hex: '#94a3b8',
    dot: 'bg-slate-400 ring-slate-400/20',
    text: 'text-slate-500 dark:text-slate-300',
    border: 'border-slate-400/30',
  },
  stopped: {
    hex: '#94a3b8',
    dot: 'bg-slate-400 ring-slate-400/20',
    text: 'text-slate-500 dark:text-slate-300',
    border: 'border-slate-400/30',
  },
  nuc: {
    hex: '#fbbf24',
    dot: 'bg-amber-400 ring-amber-400/30',
    text: 'text-amber-500 dark:text-amber-400',
    border: 'border-amber-400/40',
  },
  selected: {
    hex: '#fbbf24',
    dot: 'bg-amber-400 ring-amber-400/40',
    text: 'text-amber-500 dark:text-amber-400',
    border: 'border-amber-400/50',
  },
  stroke: { hex: '#0f172a' },
} as const;
