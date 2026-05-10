import { describe, expect, it } from 'vitest';
import {
  SHIP_TYPE_BANDS,
  SHIP_TYPE_CATEGORIES,
  shipCategoryLabel,
  shipTypeCategory,
  shipTypeLabel,
} from '../ship-type';

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

describe('shipTypeCategory', () => {
  it('classifies cargo codes 70..79', () => {
    expect(shipTypeCategory(70)).toBe('cargo');
    expect(shipTypeCategory(75)).toBe('cargo');
    expect(shipTypeCategory(79)).toBe('cargo');
  });

  it('classifies tanker codes 80..89', () => {
    expect(shipTypeCategory(80)).toBe('tanker');
    expect(shipTypeCategory(85)).toBe('tanker');
    expect(shipTypeCategory(89)).toBe('tanker');
  });

  it('classifies passenger codes 60..69', () => {
    expect(shipTypeCategory(60)).toBe('passenger');
    expect(shipTypeCategory(65)).toBe('passenger');
    expect(shipTypeCategory(69)).toBe('passenger');
  });

  it('classifies fishing as code 30 only', () => {
    expect(shipTypeCategory(30)).toBe('fishing');
    expect(shipTypeCategory(31)).not.toBe('fishing');
  });

  it('classifies sailing for codes 36 and 37', () => {
    expect(shipTypeCategory(36)).toBe('sailing');
    expect(shipTypeCategory(37)).toBe('sailing');
  });

  it('classifies service codes (tug, dredger, military, pilot, SAR, port tender)', () => {
    for (const code of [31, 32, 33, 34, 35, 50, 51, 52, 53, 54, 55, 58]) {
      expect(shipTypeCategory(code)).toBe('service');
    }
  });

  it('classifies code 0 (not available) and 90..99 as other', () => {
    expect(shipTypeCategory(0)).toBe('other');
    expect(shipTypeCategory(90)).toBe('other');
    expect(shipTypeCategory(99)).toBe('other');
  });

  it('classifies WIG craft (20..29) and high-speed (40..49) as other for now', () => {
    expect(shipTypeCategory(25)).toBe('other');
    expect(shipTypeCategory(45)).toBe('other');
  });

  it('classifies codes outside 0..99 as other', () => {
    expect(shipTypeCategory(150)).toBe('other');
    expect(shipTypeCategory(-1)).toBe('other');
  });
});

describe('shipCategoryLabel', () => {
  it('returns a label for every declared category', () => {
    for (const category of SHIP_TYPE_CATEGORIES) {
      const label = shipCategoryLabel(category);
      expect(label).toBeTruthy();
      expect(label).toMatch(/^[A-Z]/);
    }
  });
});
