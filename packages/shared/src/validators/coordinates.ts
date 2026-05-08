import type { LngLat } from '../types/geo';
import { type Result, err, ok } from './reject-reason';

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/**
 * Predicate form. Returns true iff both axes are finite and within the
 * WGS84 valid ranges. The AIS sentinels (lat 91, lng 181) have already
 * been decoded to `null` upstream; positions reaching this validator are
 * assumed non-null.
 */
export function isValidLatLng(position: LngLat): boolean {
  const [lng, lat] = position;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < LAT_MIN || lat > LAT_MAX) return false;
  if (lng < LNG_MIN || lng > LNG_MAX) return false;
  return true;
}

/**
 * Smart-constructor form. Returns the position unchanged on success or
 * an axis-typed RejectReason on failure. Latitude is checked first so
 * that simultaneously-bad inputs surface as `out-of-range-lat`.
 */
export function validateLatLng(position: LngLat): Result<LngLat> {
  if (isValidLatLng(position)) return ok(position);
  const [lng, lat] = position;
  if (!Number.isFinite(lat) || lat < LAT_MIN || lat > LAT_MAX) {
    return err({ kind: 'out-of-range-lat', value: lat });
  }
  return err({ kind: 'out-of-range-lng', value: lng });
}
