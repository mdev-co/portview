import { atom } from 'nanostores';
import { SZCZECIN_ZONE_COLLECTION, type ZoneCollection } from '@sps/shared';

const STORAGE_KEY = 'sps:geofence-zones:v1';
const MAX_ZONES = 50;
const MAX_STORAGE_BYTES = 500_000;

type StoredEnvelope = {
  readonly version: 1;
  readonly zones: ZoneCollection;
};

/**
 * Operator-visible zones rendered on the map and used by the
 * dwell-time membership pipeline. Seeded with the hard-coded
 * Szczecin port set; terra-draw operator drawing replaces the
 * atom value at runtime with the live FeatureCollection. Storage
 * is GeoJSON throughout so a draw-and-save loop is a single
 * `setGeofenceZones(updatedCollection)` call - no transform.
 *
 * Operator-drawn zones are persisted in `localStorage` (MVP).
 * Bloat caps: max 50 zones, max 500 KB serialized envelope.
 * Hydration runs at module load; failure falls back to the
 * hard-coded set without throwing.
 */
export const $geofenceZones = atom<ZoneCollection>(hydrateOrDefault());

export class InvalidZoneIdError extends Error {
  constructor(id: string) {
    super(
      `Zone id "${id}" contains the reserved "|" separator; pick a different identifier or sanitize at the draw boundary`,
    );
    this.name = 'InvalidZoneIdError';
  }
}

export class ZoneCountExceededError extends Error {
  constructor(count: number) {
    super(`Zone collection holds ${count} features; max is ${MAX_ZONES}`);
    this.name = 'ZoneCountExceededError';
  }
}

export class ZoneStorageQuotaError extends Error {
  constructor(bytes: number) {
    super(
      `Serialized zone envelope is ${bytes} bytes; max is ${MAX_STORAGE_BYTES} (~${MAX_STORAGE_BYTES / 1000} KB)`,
    );
    this.name = 'ZoneStorageQuotaError';
  }
}

export function setGeofenceZones(collection: ZoneCollection): void {
  for (const feature of collection.features) {
    if (feature.properties.id.includes('|')) {
      throw new InvalidZoneIdError(feature.properties.id);
    }
  }
  if (collection.features.length > MAX_ZONES) {
    throw new ZoneCountExceededError(collection.features.length);
  }
  const serialized = JSON.stringify({ version: 1, zones: collection } satisfies StoredEnvelope);
  if (serialized.length > MAX_STORAGE_BYTES) {
    throw new ZoneStorageQuotaError(serialized.length);
  }
  $geofenceZones.set(collection);
  persist(serialized);
}

function persist(serialized: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Quota or privacy mode - silent. Atom value is still set;
    // operator just loses cross-session persistence this tick.
  }
}

function hydrateOrDefault(): ZoneCollection {
  if (typeof window === 'undefined') return SZCZECIN_ZONE_COLLECTION;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return SZCZECIN_ZONE_COLLECTION;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed.version !== 1) return SZCZECIN_ZONE_COLLECTION;
    const zones = parsed.zones;
    if (zones === undefined || zones.type !== 'FeatureCollection') {
      return SZCZECIN_ZONE_COLLECTION;
    }
    return zones;
  } catch {
    return SZCZECIN_ZONE_COLLECTION;
  }
}
