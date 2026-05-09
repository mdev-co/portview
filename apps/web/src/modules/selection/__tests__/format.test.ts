import { describe, expect, it } from 'vitest';
import {
  formatCog,
  formatHeading,
  formatLatLng,
  formatRelativeTime,
  formatSog,
} from '../lib/format';

describe('formatSog', () => {
  it('formats with 1 decimal and unit', () => {
    expect(formatSog(12.345)).toBe('12.3 kn');
  });
  it('returns dash for null', () => {
    expect(formatSog(null)).toBe('—');
  });
});

describe('formatCog / formatHeading', () => {
  it('formats degrees', () => {
    expect(formatCog(217.4)).toBe('217.4°');
    expect(formatHeading(215)).toBe('215°');
  });
  it('returns dash for null', () => {
    expect(formatCog(null)).toBe('—');
    expect(formatHeading(null)).toBe('—');
  });
});

describe('formatLatLng', () => {
  it('uses N/S for latitude based on sign', () => {
    expect(formatLatLng(53.4285, 'lat')).toContain('N');
    expect(formatLatLng(-53.4285, 'lat')).toContain('S');
  });
  it('uses E/W for longitude based on sign', () => {
    expect(formatLatLng(14.5528, 'lng')).toContain('E');
    expect(formatLatLng(-14.5528, 'lng')).toContain('W');
  });
  it('emits 6 decimal places', () => {
    expect(formatLatLng(53.4285, 'lat')).toMatch(/^53\.428500° N$/);
  });
});

describe('formatRelativeTime', () => {
  it('< 60 s -> Ns', () => {
    expect(formatRelativeTime(1_000, 1_005)).toBe('5s ago');
  });
  it('60..3599 s -> Nm', () => {
    expect(formatRelativeTime(1_000, 1_180)).toBe('3m ago');
  });
  it('>= 3600 s -> Nh', () => {
    expect(formatRelativeTime(1_000, 1_000 + 3 * 3_600 + 60)).toBe('3h ago');
  });
  it('clamps negative deltas to 0', () => {
    expect(formatRelativeTime(2_000, 1_000)).toBe('0s ago');
  });
});
