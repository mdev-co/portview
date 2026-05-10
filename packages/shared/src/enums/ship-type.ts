/**
 * AIS ITU-R M.1371-5 §3.3.8.3.5 ship type code -> human label.
 *
 * The spec partitions the 0..99 range into bands; some bands degenerate
 * to a single code. Modelled as a sorted lookup table rather than an
 * if-ladder so the data reads as data, additions are one-line, and a
 * second consumer (map tooltip, filter UI, ADR-0010 follow-up) reuses
 * the same source.
 *
 * Code 0 means "not available". Codes outside the documented bands
 * (101..255) return null - upstream noise rather than a defined kind.
 */

export type ShipTypeBand = {
  readonly min: number;
  readonly max: number;
  readonly label: string;
};

export const SHIP_TYPE_BANDS: readonly ShipTypeBand[] = [
  { min: 20, max: 29, label: 'WIG craft' },
  { min: 30, max: 30, label: 'Fishing' },
  { min: 31, max: 32, label: 'Tug' },
  { min: 33, max: 33, label: 'Dredger' },
  { min: 34, max: 34, label: 'Diving' },
  { min: 35, max: 35, label: 'Military' },
  { min: 36, max: 36, label: 'Sailing' },
  { min: 37, max: 37, label: 'Pleasure craft' },
  { min: 40, max: 49, label: 'High-speed craft' },
  { min: 50, max: 50, label: 'Pilot' },
  { min: 51, max: 51, label: 'Search & rescue' },
  { min: 52, max: 52, label: 'Tug' },
  { min: 53, max: 53, label: 'Port tender' },
  { min: 54, max: 54, label: 'Anti-pollution' },
  { min: 55, max: 55, label: 'Law enforcement' },
  { min: 58, max: 58, label: 'Medical transport' },
  { min: 60, max: 69, label: 'Passenger' },
  { min: 70, max: 79, label: 'Cargo' },
  { min: 80, max: 89, label: 'Tanker' },
  { min: 90, max: 99, label: 'Other' },
];

export function shipTypeLabel(code: number): string | null {
  if (code <= 0) return null;
  const band = SHIP_TYPE_BANDS.find(b => code >= b.min && code <= b.max);
  return band?.label ?? null;
}
