import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Zone } from './types';

/**
 * Test whether a (lng, lat) position is inside a zone polygon.
 *
 * Thin wrapper over `@turf/boolean-point-in-polygon` so the rest of
 * the codebase touches the GeoJSON contract through one named
 * boundary: zones are GeoJSON Features all the way, vessels reach
 * us as `(lng, lat)` doubles, and we never reach for the
 * turf primitives directly outside this module.
 *
 * Performance: turf's PIP uses ray-casting on the polygon vertices.
 * For the Szczecin zone set (5 polygons, ~10 vertices each) this is
 * a few hundred floating-point comparisons per vessel update -
 * negligible at the AIS broadcast cadence (1-5 Hz per vessel).
 */
export function isInsideZone(lng: number, lat: number, zone: Zone): boolean {
  // turf throws on NaN positions; we guard so a vessel that broadcasts
  // a missing fix (lat/lng = null sentinel resolved to NaN somewhere
  // upstream) does not crash the membership tick.
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return booleanPointInPolygon(turfPoint([lng, lat]), zone);
}
