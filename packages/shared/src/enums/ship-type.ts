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

/**
 * Higher-level grouping of the ITU-R ship-type bands. Used to drive
 * map marker color and sidebar category badges. Six functional groups
 * + `other` for codes outside the documented bands or unknown:
 *
 *   - cargo:     70-79 (general cargo, container, bulk)
 *   - tanker:    80-89 (oil, chemicals, gas)
 *   - passenger: 60-69 (cruise, ferry, ro-pax)
 *   - fishing:   30 (fishing vessels)
 *   - sailing:   36, 37 (sailing yachts, pleasure craft)
 *   - service:   31-35, 50-58 (tug, dredger, diving, military, pilot,
 *                SAR, port tender, anti-pollution, law enforcement,
 *                medical transport - covers ITU-R "Special craft" 50-58
 *                plus the towing/dredging/diving/military codes from
 *                the 30s band; "service" is the operator-friendly name
 *                that "Special" hides behind in the spec)
 *   - other:     code 0 ("not available"), 20-29 WIG, 40-49 high-speed,
 *                90-99 generic "other", or codes outside 0..99
 */
export type ShipTypeCategory =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'sailing'
  | 'service'
  | 'other';

export const SHIP_TYPE_CATEGORIES: readonly ShipTypeCategory[] = [
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'sailing',
  'service',
  'other',
];

const FISHING_CODE = 30;
const SAILING_CODES: ReadonlySet<number> = new Set([36, 37]);
const SERVICE_CODES: ReadonlySet<number> = new Set([
  31, 32, 33, 34, 35, 50, 51, 52, 53, 54, 55, 58,
]);

export function shipTypeCategory(code: number): ShipTypeCategory {
  if (code === FISHING_CODE) return 'fishing';
  if (SAILING_CODES.has(code)) return 'sailing';
  if (SERVICE_CODES.has(code)) return 'service';
  if (code >= 60 && code <= 69) return 'passenger';
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  return 'other';
}

const CATEGORY_LABELS: Readonly<Record<ShipTypeCategory, string>> = {
  cargo: 'Cargo',
  tanker: 'Tanker',
  passenger: 'Passenger',
  fishing: 'Fishing',
  sailing: 'Sailing',
  service: 'Service',
  other: 'Other',
};

export function shipCategoryLabel(category: ShipTypeCategory): string {
  return CATEGORY_LABELS[category];
}
