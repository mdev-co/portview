import { atom } from 'nanostores';
import { SZCZECIN_ZONE_COLLECTION, type ZoneCollection } from '@sps/shared';

/**
 * Operator-visible zones rendered on the map and used by the
 * dwell-time membership pipeline. Seeded with the hard-coded
 * Szczecin port set; terra-draw operator drawing replaces the
 * atom value at runtime with the live FeatureCollection. Storage
 * is GeoJSON throughout so a draw-and-save loop is a single
 * `setGeofenceZones(updatedCollection)` call - no transform.
 */
export const $geofenceZones = atom<ZoneCollection>(SZCZECIN_ZONE_COLLECTION);

/**
 * Replace the active zone collection. Kept as a named action (vs.
 * exposing `$geofenceZones.set` to consumers) so we have a single
 * audit point for validation, persistence, and undo/redo.
 *
 * Validation: zone IDs must NOT contain the `|` separator that the
 * membership map uses to encode `(mmsi, zoneId)` composite keys.
 * Without this guard a `terra-draw` save with a pasted `|` in the
 * label-derived id would silently corrupt key parsing. We reject
 * the write entirely so the atom never holds a malformed zone set.
 */
export class InvalidZoneIdError extends Error {
  constructor(id: string) {
    super(
      `Zone id "${id}" contains the reserved "|" separator; pick a different identifier or sanitize at the draw boundary`,
    );
    this.name = 'InvalidZoneIdError';
  }
}

export function setGeofenceZones(collection: ZoneCollection): void {
  for (const feature of collection.features) {
    if (feature.properties.id.includes('|')) {
      throw new InvalidZoneIdError(feature.properties.id);
    }
  }
  $geofenceZones.set(collection);
}
