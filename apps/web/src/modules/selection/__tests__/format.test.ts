import { describe, expect, it } from 'vitest';
import { shipTypeLabel } from '@sps/shared';
import {
  formatCallSign,
  formatCog,
  formatDestination,
  formatDimensions,
  formatDraught,
  formatEta,
  formatHeading,
  formatImo,
  formatLatLng,
  formatRelativeTime,
  formatShipType,
  formatSog,
  formatVesselName,
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

describe('static-data formatters', () => {
  it('formatImo shows number or dash', () => {
    expect(formatImo(9_725_634)).toBe('9725634');
    expect(formatImo(null)).toBe('—');
  });
  it('formatCallSign / formatDestination / formatVesselName fall back to dash for empty strings', () => {
    expect(formatCallSign('SXFG')).toBe('SXFG');
    expect(formatCallSign('')).toBe('—');
    expect(formatDestination('GDYNIA')).toBe('GDYNIA');
    expect(formatDestination('')).toBe('—');
    expect(formatVesselName('TRIESTE')).toBe('TRIESTE');
    expect(formatVesselName('')).toBe('—');
  });
  it('formatDraught: null and zero treated as not available', () => {
    expect(formatDraught(7.4)).toBe('7.4 m');
    expect(formatDraught(null)).toBe('—');
    expect(formatDraught(0)).toBe('—');
  });
  it('formatDimensions sums bow+stern and port+starboard', () => {
    expect(formatDimensions({ toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 })).toBe(
      '180 × 28 m',
    );
    expect(formatDimensions(null)).toBe('—');
    expect(formatDimensions({ toBow: 0, toStern: 0, toPort: 0, toStarboard: 0 })).toBe('—');
  });
  it('shipTypeLabel maps spec bands', () => {
    expect(shipTypeLabel(70)).toBe('Cargo');
    expect(shipTypeLabel(80)).toBe('Tanker');
    expect(shipTypeLabel(60)).toBe('Passenger');
    expect(shipTypeLabel(0)).toBeNull();
    expect(shipTypeLabel(150)).toBeNull();
  });
  it('formatShipType wraps label with code in parens', () => {
    expect(formatShipType(70)).toBe('Cargo (70)');
    expect(formatShipType(0)).toBe('—');
  });
  it('formatEta combines date and time when both fields valid', () => {
    expect(formatEta({ month: 5, day: 12, hour: 14, minute: 30 })).toBe('05-12 14:30');
  });
  it('formatEta degrades gracefully when fields are not available', () => {
    expect(formatEta({ month: 0, day: 0, hour: 24, minute: 60 })).toBe('—');
    expect(formatEta({ month: 5, day: 12, hour: 24, minute: 60 })).toBe('05-12');
    expect(formatEta({ month: 0, day: 0, hour: 14, minute: 30 })).toBe('14:30');
  });
});
