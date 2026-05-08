import { describe, expect, it } from 'vitest';
import { isValidMmsi, parseMmsi } from '../mmsi';

describe('isValidMmsi', () => {
  it('rejects non-integer values', () => {
    expect(isValidMmsi(123.45)).toBe(false);
    expect(isValidMmsi(Number.NaN)).toBe(false);
  });

  it('rejects negative values', () => {
    expect(isValidMmsi(-1)).toBe(false);
  });

  it('rejects sentinel zero', () => {
    expect(isValidMmsi(0)).toBe(false);
  });

  it('rejects MID below the baseline (199...)', () => {
    expect(isValidMmsi(199_999_999)).toBe(false);
  });

  it('rejects MID above the baseline (800...)', () => {
    expect(isValidMmsi(800_000_000)).toBe(false);
  });

  it('rejects AtoN range (990xxxxxx) at baseline', () => {
    expect(isValidMmsi(992_345_678)).toBe(false);
  });

  it('rejects SAR aircraft range (111xxxxxx) at baseline', () => {
    expect(isValidMmsi(111_234_567)).toBe(false);
  });

  it('accepts the lower MID boundary 200', () => {
    expect(isValidMmsi(200_000_000)).toBe(true);
  });

  it('accepts the upper MID boundary 799', () => {
    expect(isValidMmsi(799_999_999)).toBe(true);
  });

  it('accepts a typical Polish MID 261', () => {
    expect(isValidMmsi(261_345_678)).toBe(true);
  });

  it('rejects values exceeding 9 digits', () => {
    expect(isValidMmsi(1_000_000_000)).toBe(false);
  });
});

describe('parseMmsi', () => {
  it('returns ok with the number when valid', () => {
    const result = parseMmsi(261_000_001);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(261_000_001);
  });

  it('returns invalid-mmsi reject for invalid input', () => {
    const result = parseMmsi(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-mmsi');
      if (result.error.kind === 'invalid-mmsi') expect(result.error.value).toBe(0);
    }
  });

  it('returns invalid-mmsi (not a different kind) for AtoN range', () => {
    const result = parseMmsi(992_345_678);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-mmsi');
  });

  it('returns invalid-mmsi (not a different kind) for SAR aircraft range', () => {
    const result = parseMmsi(111_234_567);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-mmsi');
  });
});
