import type { ShipTypeCategory } from '@sps/shared';

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

/**
 * Tailwind v4 needs literal class strings for build-time scanning, so
 * each entry stays static. Single-row form keeps the table scannable
 * and the four columns aligned. 700-tier hex pops on OSM tiles; slate
 * shifts to 600 because 700 is too close to dark-theme background.
 */
type CategoryEntry = {
  readonly hex: string;
  readonly dot: string;
  readonly text: string;
  readonly border: string;
};

// prettier-ignore
export const VESSEL_CATEGORY_PALETTE: Readonly<Record<ShipTypeCategory, CategoryEntry>> = {
  cargo:     { hex: '#1d4ed8', dot: 'bg-blue-700 ring-blue-700/30',       text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-700/40' },
  tanker:    { hex: '#b91c1c', dot: 'bg-red-700 ring-red-700/30',         text: 'text-red-700 dark:text-red-300',         border: 'border-red-700/40' },
  passenger: { hex: '#047857', dot: 'bg-emerald-700 ring-emerald-700/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-700/40' },
  fishing:   { hex: '#b45309', dot: 'bg-amber-700 ring-amber-700/30',     text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-700/40' },
  sailing:   { hex: '#0e7490', dot: 'bg-cyan-700 ring-cyan-700/30',       text: 'text-cyan-700 dark:text-cyan-300',       border: 'border-cyan-700/40' },
  service:   { hex: '#6d28d9', dot: 'bg-violet-700 ring-violet-700/30',   text: 'text-violet-700 dark:text-violet-300',   border: 'border-violet-700/40' },
  other:     { hex: '#475569', dot: 'bg-slate-600 ring-slate-600/25',     text: 'text-slate-600 dark:text-slate-400',     border: 'border-slate-600/30' },
};
