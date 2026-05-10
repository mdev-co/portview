import { describe, expect, it } from 'vitest';
import { SourceId } from '@sps/shared';
import type { LiveVessel } from '../../../telemetry/types';
import { interpolateVesselPosition } from '../dead-reckoning';

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_000_000,
    messageType: 1,
    navStatus: 0,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: 14.5528,
    lat: 53.4285,
    sog: 10,
    cog: 90,
    trueHeading: 91,
    timestampUnix: 1_715_000_000,
    flags: 0,
    ...over,
  };
}

describe('interpolateVesselPosition', () => {
  it('returns the original position when sog is at or below the threshold', () => {
    const result = interpolateVesselPosition(vessel({ sog: 0.4 }), 1_715_000_060);
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('returns the original position when both cog and trueHeading are null', () => {
    const result = interpolateVesselPosition(
      vessel({ cog: null, trueHeading: null }),
      1_715_000_060,
    );
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('returns null when lng or lat is null', () => {
    expect(interpolateVesselPosition(vessel({ lng: null }), 1_715_000_000)).toBeNull();
    expect(interpolateVesselPosition(vessel({ lat: null }), 1_715_000_000)).toBeNull();
  });

  it('moves a vessel eastward when course is 90 degrees', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53 }),
      1_715_000_030,
    );
    if (!result) throw new Error('expected position');
    expect(result.lat).toBeCloseTo(53, 4);
    expect(result.lng).toBeGreaterThan(14);
  });

  it('moves a vessel northward when course is 0 degrees', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: 0, lng: 14, lat: 53 }),
      1_715_000_010,
    );
    if (!result) throw new Error('expected position');
    expect(result.lng).toBeCloseTo(14, 4);
    expect(result.lat).toBeGreaterThan(53);
  });

  it('falls back to the original position when delta_t exceeds the freshness window', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_700,
    );
    expect(result).toEqual({ lng: 14, lat: 53 });
  });

  it('damps velocity exponentially within the freshness window', () => {
    const fresh = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_005,
    );
    const damped = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_080,
    );
    if (!fresh || !damped) throw new Error('expected positions');
    const freshDistance = Math.abs(fresh.lng - 14);
    const dampedDistance = Math.abs(damped.lng - 14);
    // 80s of damped motion should be well below 16x the 5s case
    // (linear projection would be ~16x; damping suppresses it).
    expect(dampedDistance).toBeLessThan(freshDistance * 16);
    expect(dampedDistance).toBeGreaterThan(freshDistance);
  });

  it('keeps extrapolating up to but not past the 90s freshness boundary', () => {
    const before = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_089,
    );
    const after = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_091,
    );
    if (!before || !after) throw new Error('expected positions');
    expect(before.lng).toBeGreaterThan(14);
    expect(after).toEqual({ lng: 14, lat: 53 });
  });

  it('regression: a Class B vessel with 5 minute staleness does not drift onto land', () => {
    // Reproduces the observed bug: SOG 7.7 kn, delta 300s, COG due north.
    // Pre-fix this rendered ~594m north of the last fix (onto Park Zeromskiego
    // when last fix was on the Odra Zachodnia waterfront).
    const lastFix = { lng: 14.567325, lat: 53.427835 };
    const result = interpolateVesselPosition(
      vessel({
        messageType: 18,
        sog: 7.7,
        cog: 0,
        lng: lastFix.lng,
        lat: lastFix.lat,
        timestampUnix: 1_715_000_000,
      }),
      1_715_000_300,
    );
    expect(result).toEqual(lastFix);
  });

  it('falls back to the original position when nowSeconds is in the past', () => {
    const result = interpolateVesselPosition(
      vessel({ timestampUnix: 1_715_000_100 }),
      1_715_000_000,
    );
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('uses trueHeading when cog is null', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: null, trueHeading: 90, lng: 14, lat: 53 }),
      1_715_000_030,
    );
    if (!result) throw new Error('expected position');
    expect(result.lng).toBeGreaterThan(14);
    expect(result.lat).toBeCloseTo(53, 4);
  });
});
