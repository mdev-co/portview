import type { Mmsi } from '../types/brands';
import { type Result, err, ok } from './reject-reason';

const MMSI_MIN = 0;
const MMSI_MAX = 999_999_999;
const MID_MIN = 200;
const MID_MAX = 799;

/**
 * Type guard. A number is a valid Mmsi iff it is a non-negative 9-digit
 * integer whose 3-digit MID prefix falls within the standard ship-MMSI
 * range [200, 799]. AtoN, SAR aircraft, base station and craft-associated
 * MMSI ranges are intentionally rejected by this baseline; their inclusion
 * is gated on analysis of real `.data/rejected_frames.jsonl` traffic.
 */
export function isValidMmsi(value: number): value is Mmsi {
  if (!Number.isInteger(value)) return false;
  if (value < MMSI_MIN || value > MMSI_MAX) return false;
  const mid = Math.floor(value / 1_000_000);
  return mid >= MID_MIN && mid <= MID_MAX;
}

/**
 * Smart constructor. The single legal cast site to a Mmsi value.
 * Direct casts (`x as Mmsi`) outside this module are forbidden by
 * convention; the brand can only be obtained through this function.
 */
export function parseMmsi(value: number): Result<Mmsi> {
  if (isValidMmsi(value)) return ok(value);
  return err({ kind: 'invalid-mmsi', value });
}
