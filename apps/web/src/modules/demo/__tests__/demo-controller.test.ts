import { describe, expect, it } from 'vitest';
import { __test } from '../demo-controller';

const { ORBITS, sampleOrbit } = __test;

const ALPHA = ORBITS[0]!;

describe('sampleOrbit', () => {
  it('starts at phase=0 on the right-most point of the ellipse', () => {
    const sample = sampleOrbit(ALPHA, 0);
    expect(sample.lng).toBeCloseTo(ALPHA.centerLng + ALPHA.radiusLng, 9);
    expect(sample.lat).toBeCloseTo(ALPHA.centerLat, 9);
  });

  it('moves a quarter turn to the top of the ellipse after period/4 seconds', () => {
    const sample = sampleOrbit(ALPHA, ALPHA.periodSeconds / 4);
    expect(sample.lng).toBeCloseTo(ALPHA.centerLng, 9);
    expect(sample.lat).toBeCloseTo(ALPHA.centerLat + ALPHA.radiusLat, 9);
  });

  it('returns to the starting point after one full period', () => {
    const start = sampleOrbit(ALPHA, 0);
    const oneLap = sampleOrbit(ALPHA, ALPHA.periodSeconds);
    expect(oneLap.lng).toBeCloseTo(start.lng, 9);
    expect(oneLap.lat).toBeCloseTo(start.lat, 9);
  });

  it('reports a positive ground speed in knots while underway', () => {
    const sample = sampleOrbit(ALPHA, 0);
    expect(sample.sog).toBeGreaterThan(0);
    // Sanity bound for a port-scale orbit: a 180 s lap on a ~1.5 km
    // ellipse cannot exceed tens of knots; 50 is a safe upper bound.
    expect(sample.sog).toBeLessThan(50);
  });

  it('points the bow north when crossing the right-most point of the orbit', () => {
    // At phase=0 with positive omega, the analytic velocity is
    // dLng = 0 and dLat > 0 → motion straight north → COG = 0.
    const sample = sampleOrbit(ALPHA, 0);
    expect(sample.cog).toBeCloseTo(0, 1);
  });

  it('points the bow west when crossing the top of the orbit', () => {
    // Counter-clockwise traversal (north-up): right → top → left →
    // bottom → right. At the top of the ellipse motion is due west.
    const sample = sampleOrbit(ALPHA, ALPHA.periodSeconds / 4);
    expect(sample.cog).toBeCloseTo(270, 1);
  });

  it('reverses orbit direction when periodSeconds is negative', () => {
    const reversed = { ...ALPHA, periodSeconds: -ALPHA.periodSeconds };
    const forwardQuarter = sampleOrbit(ALPHA, ALPHA.periodSeconds / 4);
    const reverseQuarter = sampleOrbit(reversed, ALPHA.periodSeconds / 4);
    // Forward orbit at +T/4 lands at top of the ellipse; reversed
    // orbit at the same elapsed time lands at the bottom — opposite
    // lat side of the ellipse.
    expect(forwardQuarter.lat).toBeCloseTo(ALPHA.centerLat + ALPHA.radiusLat, 9);
    expect(reverseQuarter.lat).toBeCloseTo(ALPHA.centerLat - ALPHA.radiusLat, 9);
  });

  it('keeps COG in [0, 360) for every sample on the lap', () => {
    const steps = 36;
    for (let i = 0; i < steps; i += 1) {
      const t = (ALPHA.periodSeconds * i) / steps;
      const { cog } = sampleOrbit(ALPHA, t);
      expect(cog).toBeGreaterThanOrEqual(0);
      expect(cog).toBeLessThan(360);
    }
  });
});
