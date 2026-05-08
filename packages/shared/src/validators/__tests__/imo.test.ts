import { describe, expect, it } from 'vitest';
import { isValidImo, parseImo } from '../imo';

// Manually verified valid IMOs (mod-10 weighted sum matches trailing digit).
// 9074729: 9*7 + 0*6 + 7*5 + 4*4 + 7*3 + 2*2 = 139 -> mod10 9 == 9.
// 1234567: 1*7 + 2*6 + 3*5 + 4*4 + 5*3 + 6*2 =  77 -> mod10 7 == 7.

describe('isValidImo', () => {
  it('rejects non-integer values', () => {
    expect(isValidImo(1234567.5)).toBe(false);
    expect(isValidImo(Number.NaN)).toBe(false);
  });

  it('rejects values below the 7-digit floor', () => {
    expect(isValidImo(999_999)).toBe(false);
  });

  it('rejects values above the 7-digit ceiling', () => {
    expect(isValidImo(10_000_000)).toBe(false);
  });

  it('rejects sentinel zero (parser would already null this)', () => {
    expect(isValidImo(0)).toBe(false);
  });

  it('rejects an IMO with a wrong check digit', () => {
    expect(isValidImo(9_074_720)).toBe(false);
  });

  it('rejects another wrong check digit', () => {
    expect(isValidImo(1_234_560)).toBe(false);
  });

  it('accepts a verified-valid 7-digit IMO with correct check digit', () => {
    expect(isValidImo(9_074_729)).toBe(true);
  });

  it('accepts another verified-valid IMO', () => {
    expect(isValidImo(1_234_567)).toBe(true);
  });

  it('rejects a value of all nines', () => {
    expect(isValidImo(9_999_999)).toBe(false);
  });

  it('rejects the smallest 7-digit candidate', () => {
    expect(isValidImo(1_000_000)).toBe(false);
  });
});

describe('parseImo', () => {
  it('returns ok with the number when the check digit is correct', () => {
    const result = parseImo(9_074_729);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(9_074_729);
  });

  it('returns invalid-imo reject for a bad check digit', () => {
    const result = parseImo(9_074_720);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-imo');
      if (result.error.kind === 'invalid-imo') expect(result.error.value).toBe(9_074_720);
    }
  });
});
