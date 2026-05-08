import type { Imo } from '../types/brands';
import { type Result, err, ok } from './reject-reason';

const IMO_MIN = 1_000_000;
const IMO_MAX = 9_999_999;
const IMO_WEIGHTS = [7, 6, 5, 4, 3, 2] as const;

/**
 * Type guard. A number is a valid Imo iff it is a 7-digit integer whose
 * trailing digit equals the IMO check digit derived by the standard
 * mod-10 weighted sum (factors 7,6,5,4,3,2 over the leading 6 digits;
 * IMO Resolution A.600(15)).
 *
 * The AIS type-5 sentinel value 0 is decoded to `null` upstream by the
 * static-data parser, so this validator never observes it.
 */
export function isValidImo(value: number): value is Imo {
  if (!Number.isInteger(value)) return false;
  if (value < IMO_MIN || value > IMO_MAX) return false;

  let remaining = value;
  const digits: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    digits.unshift(remaining % 10);
    remaining = Math.floor(remaining / 10);
  }

  let sum = 0;
  for (let i = 0; i < 6; i += 1) {
    sum += digits[i]! * IMO_WEIGHTS[i]!;
  }
  return sum % 10 === digits[6];
}

/** Smart constructor. The single legal cast site to an Imo value. */
export function parseImo(value: number): Result<Imo> {
  if (isValidImo(value)) return ok(value);
  return err({ kind: 'invalid-imo', value });
}
