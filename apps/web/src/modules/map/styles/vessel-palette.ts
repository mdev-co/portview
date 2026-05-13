import type { ShipTypeCategory } from '@sps/shared';

export const VESSEL_STATUS = {
  underway: 'underway',
  anchored: 'anchored',
  stopped: 'stopped',
  nuc: 'nuc',
} as const;

export type VesselStatus = (typeof VESSEL_STATUS)[keyof typeof VESSEL_STATUS];

/**
 * Pastel-neon cool palette. Every category sits in the violet / blue
 * / cyan / teal / mint family at Tailwind 300-tier saturation - soft
 * enough to read as elegant on a light nautical base, glowy enough
 * to pop on the dark Tactical base without burning.
 *
 * Selection and not-under-command keep an amber accent because the
 * cool palette has nothing warm in it; the warm contrast is what
 * makes "I selected this vessel" visually loud.
 *
 * Stroke is slate-800 across modes. On a light base it draws the
 * marker outline; on a dark base it disappears into the background
 * and the fill takes over. Both behaviours are intentional.
 */

export const VESSEL_PALETTE = {
  underway: {
    hex: '#10b981',
    dot: 'bg-emerald-500 ring-emerald-500/30',
    text: 'text-emerald-500 dark:text-emerald-400',
    border: 'border-emerald-500/40',
  },
  anchored: {
    hex: '#cbd5e1',
    dot: 'bg-slate-300 ring-slate-300/20',
    text: 'text-slate-500 dark:text-slate-300',
    border: 'border-slate-300/30',
  },
  stopped: {
    hex: '#cbd5e1',
    dot: 'bg-slate-300 ring-slate-300/20',
    text: 'text-slate-500 dark:text-slate-300',
    border: 'border-slate-300/30',
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
  /**
   * Stroke is slate-800 (#1e293b) for text labels - dark text + white
   * halo gives the cleanest legibility on any background. Marker
   * outline is slate-900 (#0f172a) so a pastel vessel fill keeps a
   * dark contour on light bases (OSM Mapnik) and reads as a thin
   * navy line on dark bases (Tactical, Backdrop) - one outline value
   * works across every mode instead of branching per style.
   */
  stroke: { hex: '#1e293b' },
  markerOutline: { hex: '#0f172a' },
} as const;

/**
 * Marine pastel-neon category palette - violet / indigo / blue / cyan
 * / teal / mint, all 300-tier Tailwind. Each entry stays a literal
 * static class string so the v4 build scanner can extract it; hex
 * mirrors the matched Tailwind shade so the map paint expressions
 * and the sidebar dots stay aligned.
 *
 * - cargo: blue-300 (deepwater container / bulk, the workhorse).
 * - tanker: purple-400 (one shade warmer to gently signal hazard).
 * - passenger: emerald-300 (mint, friendly).
 * - fishing: indigo-300 (lavender-blue, regional craft).
 * - sailing: cyan-300 (icy aqua, recreational).
 * - service: teal-300 (turquoise, active service - pilots, tugs).
 * - other: slate-300 (low-info, recedes visually).
 */
type CategoryEntry = {
  readonly hex: string;
  readonly dot: string;
  readonly text: string;
  readonly border: string;
};

// prettier-ignore
export const VESSEL_CATEGORY_PALETTE: Readonly<Record<ShipTypeCategory, CategoryEntry>> = {
  cargo:     { hex: '#3b82f6', dot: 'bg-blue-500 ring-blue-500/30',       text: 'text-blue-500 dark:text-blue-400',       border: 'border-blue-500/40' },
  tanker:    { hex: '#9333ea', dot: 'bg-purple-600 ring-purple-600/30',   text: 'text-purple-500 dark:text-purple-400',   border: 'border-purple-600/40' },
  passenger: { hex: '#10b981', dot: 'bg-emerald-500 ring-emerald-500/30', text: 'text-emerald-500 dark:text-emerald-400', border: 'border-emerald-500/40' },
  fishing:   { hex: '#6366f1', dot: 'bg-indigo-500 ring-indigo-500/30',   text: 'text-indigo-500 dark:text-indigo-400',   border: 'border-indigo-500/40' },
  sailing:   { hex: '#06b6d4', dot: 'bg-cyan-500 ring-cyan-500/30',       text: 'text-cyan-500 dark:text-cyan-400',       border: 'border-cyan-500/40' },
  service:   { hex: '#14b8a6', dot: 'bg-teal-500 ring-teal-500/30',       text: 'text-teal-500 dark:text-teal-400',       border: 'border-teal-500/40' },
  other:     { hex: '#64748b', dot: 'bg-slate-500 ring-slate-500/25',     text: 'text-slate-500 dark:text-slate-400',     border: 'border-slate-500/30' },
};

/**
 * Neon-feel ring accent palette - same hue family as the fill but
 * two Tailwind tiers brighter. The fill paints a saturated 500/600
 * body that grounds the marker against the basemap; this palette
 * paints the dashed ring around it at the 300-tier (one shade
 * lighter than the previous 400-tier ring) so the contour reads as
 * a glowing neon outline rather than a same-family deeper line. The
 * thick 4 px canvas stroke compensates for the lighter shade so the
 * ring stays visible on cream OSM Mapnik and dark CARTO alike.
 */
// prettier-ignore
export const VESSEL_CATEGORY_RING_PALETTE: Readonly<Record<ShipTypeCategory, { readonly hex: string }>> = {
  cargo:     { hex: '#93c5fd' }, // blue-300
  tanker:    { hex: '#c084fc' }, // purple-400
  passenger: { hex: '#6ee7b7' }, // emerald-300
  fishing:   { hex: '#a5b4fc' }, // indigo-300
  sailing:   { hex: '#67e8f9' }, // cyan-300
  service:   { hex: '#5eead4' }, // teal-300
  other:     { hex: '#cbd5e1' }, // slate-300
};

export const VESSEL_UNDERWAY_RING_HEX = '#6ee7b7'; // emerald-300
