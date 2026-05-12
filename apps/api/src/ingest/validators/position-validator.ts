/**
 * Range checks on AIS position-bearing fields.
 *
 * AIS sentinel values (lat=91, lng=181, sog=102.3, cog=360, hdg=511)
 * are spec-defined "no fix" markers; legitimate ingest converts them
 * to null in the decoder. By the time a frame reaches this validator
 * the position is supposed to be a real measurement, so any value
 * outside the geometric / physical range is either malformed or a
 * spoofed broadcast trying to poison the database.
 *
 * Out-of-range values are rejected at the ingest boundary so they
 * cannot reach Postgres or the WebSocket fan-out.
 */

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;
const SOG_MAX_KNOTS = 102.2;
const COG_MAX = 360;
const HEADING_MAX = 359;

export type PositionFields = {
  readonly lat: number;
  readonly lng: number;
  readonly speedOverGround: number | null;
  readonly courseOverGround: number | null;
  readonly trueHeading: number | null;
};

export type PositionRejectionReason =
  | 'lat-out-of-range'
  | 'lng-out-of-range'
  | 'sog-out-of-range'
  | 'cog-out-of-range'
  | 'heading-out-of-range';

export function validatePosition(
  fields: PositionFields,
): { ok: true } | { ok: false; reason: PositionRejectionReason } {
  if (
    !Number.isFinite(fields.lat) ||
    fields.lat < LAT_MIN ||
    fields.lat > LAT_MAX
  ) {
    return { ok: false, reason: 'lat-out-of-range' };
  }
  if (
    !Number.isFinite(fields.lng) ||
    fields.lng < LNG_MIN ||
    fields.lng > LNG_MAX
  ) {
    return { ok: false, reason: 'lng-out-of-range' };
  }
  if (fields.speedOverGround !== null) {
    if (
      !Number.isFinite(fields.speedOverGround) ||
      fields.speedOverGround < 0 ||
      fields.speedOverGround > SOG_MAX_KNOTS
    ) {
      return { ok: false, reason: 'sog-out-of-range' };
    }
  }
  if (fields.courseOverGround !== null) {
    if (
      !Number.isFinite(fields.courseOverGround) ||
      fields.courseOverGround < 0 ||
      fields.courseOverGround > COG_MAX
    ) {
      return { ok: false, reason: 'cog-out-of-range' };
    }
  }
  if (fields.trueHeading !== null) {
    if (
      !Number.isInteger(fields.trueHeading) ||
      fields.trueHeading < 0 ||
      fields.trueHeading > HEADING_MAX
    ) {
      return { ok: false, reason: 'heading-out-of-range' };
    }
  }
  return { ok: true };
}
