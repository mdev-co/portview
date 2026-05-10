import { describe, expect, it } from 'vitest';
import { SHIP_TYPE_BANDS, shipTypeLabel } from '../ship-type';

describe('shipTypeLabel', () => {
  it('returns null for "not available" sentinel and codes <= 0', () => {
    expect(shipTypeLabel(0)).toBeNull();
    expect(shipTypeLabel(-1)).toBeNull();
  });

  it('maps single-code bands to their label', () => {
    expect(shipTypeLabel(30)).toBe('Fishing');
    expect(shipTypeLabel(33)).toBe('Dredger');
    expect(shipTypeLabel(50)).toBe('Pilot');
    expect(shipTypeLabel(51)).toBe('Search & rescue');
    expect(shipTypeLabel(58)).toBe('Medical transport');
  });

  it('maps multi-code bands across the full range', () => {
    expect(shipTypeLabel(20)).toBe('WIG craft');
    expect(shipTypeLabel(29)).toBe('WIG craft');
    expect(shipTypeLabel(40)).toBe('High-speed craft');
    expect(shipTypeLabel(49)).toBe('High-speed craft');
    expect(shipTypeLabel(70)).toBe('Cargo');
    expect(shipTypeLabel(79)).toBe('Cargo');
    expect(shipTypeLabel(80)).toBe('Tanker');
    expect(shipTypeLabel(89)).toBe('Tanker');
  });

  it('returns null for codes that fall in unallocated gaps (38, 39, 56, 57, 59)', () => {
    expect(shipTypeLabel(38)).toBeNull();
    expect(shipTypeLabel(39)).toBeNull();
    expect(shipTypeLabel(56)).toBeNull();
    expect(shipTypeLabel(57)).toBeNull();
    expect(shipTypeLabel(59)).toBeNull();
  });

  it('returns null for codes outside the documented 0..99 range', () => {
    expect(shipTypeLabel(100)).toBeNull();
    expect(shipTypeLabel(150)).toBeNull();
    expect(shipTypeLabel(255)).toBeNull();
  });
});

describe('SHIP_TYPE_BANDS table integrity', () => {
  it('has bands sorted by min and non-overlapping', () => {
    for (let i = 1; i < SHIP_TYPE_BANDS.length; i += 1) {
      const prev = SHIP_TYPE_BANDS[i - 1];
      const curr = SHIP_TYPE_BANDS[i];
      if (prev === undefined || curr === undefined) throw new Error('table index out of bounds');
      expect(prev.min).toBeLessThan(curr.min);
      expect(prev.max).toBeLessThan(curr.min);
    }
  });

  it('every band has min <= max', () => {
    for (const band of SHIP_TYPE_BANDS) {
      expect(band.min).toBeLessThanOrEqual(band.max);
    }
  });
});
