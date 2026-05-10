import type { ShipTypeCode } from '../types/brands';
import { type Result, err, ok } from './reject-reason';

const SHIP_TYPE_MIN = 0;
const SHIP_TYPE_MAX = 255;

/**
 * Type guard. The AIS ITU-R M.1371-5 §3.3.8.3.5 wire field is 8 bits,
 * so any non-negative integer in 0..255 round-trips without loss. The
 * spec assigns meaning only to 0..99; values 100..255 are reserved
 * upstream. We accept the full byte range at the brand boundary and
 * leave the semantic interpretation (cargo / tanker / etc) to
 * `shipTypeCategory`, which maps unknown bands to `other`.
 */
export function isValidShipType(value: number): value is ShipTypeCode {
  if (!Number.isInteger(value)) return false;
  return value >= SHIP_TYPE_MIN && value <= SHIP_TYPE_MAX;
}

/**
 * Smart constructor. The single legal cast site to a ShipTypeCode
 * value. Direct casts (`x as ShipTypeCode`) outside this module are
 * forbidden by convention; the brand can only be obtained through
 * this function.
 */
export function parseShipType(value: number): Result<ShipTypeCode> {
  if (isValidShipType(value)) return ok(value);
  return err({ kind: 'invalid-ship-type', value });
}
