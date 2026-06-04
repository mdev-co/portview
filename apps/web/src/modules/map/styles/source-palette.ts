import type { ExpressionSpecification } from 'maplibre-gl';
import { SourceId } from '@sps/shared';

/**
 * Visual identity per ingest source.
 *
 * The map opacity multiplier dims fallback feeds so the operator can tell
 * at a glance which vessels are flowing through the owned RTL-SDR antenna
 * (EdgeBridge, full opacity) versus a fallback feed (AisStream, WebSdr,
 * LocalUdp - softened to 0.55). Combined with the existing age-based
 * opacity ramp via a multiply expression, the marker still fades to zero
 * when the vessel becomes stale.
 *
 * Sidebar uses the dot color hex (with a hollow variant for fallback) so
 * the row label carries the same source signal without colliding with
 * the per-category fill on the map marker.
 */

export type SourcePaletteEntry = {
  readonly label: string;
  readonly dotHex: string;
  readonly dotFilled: boolean;
  readonly description: string;
};

/**
 * Fallback opacity for any source other than EdgeBridge. Picked low
 * enough to read as "secondary" at zoom-out but still legible when an
 * operator zooms in.
 */
const FALLBACK_SOURCE_OPACITY = 0.55;

/**
 * Opacity for entries without a sourceId (legacy rows seeded before
 * sourceId tracking, snapshot rows where the column is null). Subtle so
 * they do not draw attention until a live frame promotes them.
 */
const UNKNOWN_SOURCE_OPACITY = 0.4;

/**
 * MapLibre expression: returns 1.0 for EdgeBridge vessels, 0.55 for any
 * other source, 0.4 when the source is unknown. Designed to be combined
 * with `opacityByAge` via a multiply so the staleness ramp still applies.
 */
export const opacityBySource: ExpressionSpecification = [
  'case',
  ['==', ['get', 'sourceId'], SourceId.EdgeBridge],
  1.0,
  ['==', ['get', 'sourceId'], null],
  UNKNOWN_SOURCE_OPACITY,
  FALLBACK_SOURCE_OPACITY,
];

export const SOURCE_PALETTE: Readonly<Record<SourceId, SourcePaletteEntry>> = {
  [SourceId.LocalUdp]: {
    label: 'LocalUdp',
    dotHex: '#fbbf24', // amber-400 - dev/debug context
    dotFilled: true,
    description: 'Local dev UDP feed',
  },
  [SourceId.WebSdr]: {
    label: 'WebSdr',
    dotHex: '#cbd5e1', // slate-300 - regional fallback, most muted
    dotFilled: false,
    description: 'Regional WebSDR fallback',
  },
  [SourceId.AisStream]: {
    label: 'AisStream',
    dotHex: '#94a3b8', // slate-400 - public fallback, neutral
    dotFilled: false,
    description: 'Public AisStream fallback',
  },
  [SourceId.EdgeBridge]: {
    label: 'EdgeBridge',
    dotHex: '#10b981', // emerald-500 - owned signal, the one accent
    dotFilled: true,
    description: 'Own RTL-SDR antenna over mTLS edge bridge',
  },
};

/**
 * Sidebar / detail-panel palette entry for an unknown source id (legacy
 * row pre sourceId tracking). Matches the map opacity wash so the two
 * surfaces stay consistent.
 */
export const UNKNOWN_SOURCE_PALETTE: SourcePaletteEntry = {
  label: 'Unknown',
  dotHex: '#e2e8f0', // slate-200 - barely there
  dotFilled: false,
  description: 'Source not recorded (pre sourceId tracking)',
};

/**
 * Adapter boundary: `sourceId` originates from the WebSocket decoder
 * and the database, both of which carry raw int32 that the type system
 * cannot pin to {@link SourceId} at runtime. A legacy DB row written
 * before sourceId tracking, a decoder edge case, or a future expansion
 * of the enum can all surface a value that has no entry in
 * {@link SOURCE_PALETTE}. The lookup MUST fall back rather than return
 * `undefined` to the JSX consumer - the previous version crashed the
 * sidebar tree in production when an out-of-range integer reached
 * SourceDot.
 */
export function paletteFor(sourceId: SourceId | null | undefined): SourcePaletteEntry {
  if (sourceId === null || sourceId === undefined) return UNKNOWN_SOURCE_PALETTE;
  return SOURCE_PALETTE[sourceId] ?? UNKNOWN_SOURCE_PALETTE;
}
