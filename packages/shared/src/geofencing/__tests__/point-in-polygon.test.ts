import { describe, expect, it } from 'vitest';
import { isInsideZone } from '../point-in-polygon';
import { type Zone, zoneId } from '../types';

function squareZone(): Zone {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [14.5, 53.4],
          [14.6, 53.4],
          [14.6, 53.5],
          [14.5, 53.5],
          [14.5, 53.4],
        ],
      ],
    },
    properties: { id: zoneId('test-square'), label: 'Test Square', kind: 'general' },
  };
}

function zoneWithHole(): Zone {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [14.5, 53.4],
          [14.6, 53.4],
          [14.6, 53.5],
          [14.5, 53.5],
          [14.5, 53.4],
        ],
        [
          [14.54, 53.44],
          [14.56, 53.44],
          [14.56, 53.46],
          [14.54, 53.46],
          [14.54, 53.44],
        ],
      ],
    },
    properties: { id: zoneId('test-donut'), label: 'Test Donut', kind: 'general' },
  };
}

describe('isInsideZone', () => {
  it('accepts a point strictly inside', () => {
    expect(isInsideZone(14.55, 53.45, squareZone())).toBe(true);
  });

  it('rejects a point strictly outside', () => {
    expect(isInsideZone(14.7, 53.45, squareZone())).toBe(false);
    expect(isInsideZone(14.55, 53.39, squareZone())).toBe(false);
  });

  it('rejects a point inside an interior ring (hole)', () => {
    expect(isInsideZone(14.55, 53.45, zoneWithHole())).toBe(false);
  });

  it('still accepts points in the solid part of a holed polygon', () => {
    expect(isInsideZone(14.52, 53.42, zoneWithHole())).toBe(true);
  });

  it('returns a boolean without throwing for boundary points', () => {
    // On-edge/on-vertex membership is FP-exact in turf and effectively
    // unspecified; the dwell-machine hysteresis absorbs single-frame
    // jitter, so the contract frozen here is only: no throw, boolean out.
    expect(typeof isInsideZone(14.5, 53.4, squareZone())).toBe('boolean');
    expect(typeof isInsideZone(14.55, 53.4, squareZone())).toBe('boolean');
  });

  it('fails safe on non-finite coordinates instead of throwing', () => {
    expect(isInsideZone(Number.NaN, 53.45, squareZone())).toBe(false);
    expect(isInsideZone(14.55, Number.NaN, squareZone())).toBe(false);
    expect(isInsideZone(Number.POSITIVE_INFINITY, 53.45, squareZone())).toBe(false);
  });
});
