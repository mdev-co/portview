import { describe, expect, it } from 'vitest';
import { type Mmsi, SourceId } from '@sps/shared';
import type { LiveVessel } from '../../../telemetry/types';
import { interpolateVesselPosition } from '../dead-reckoning';

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_000_000 as Mmsi,
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

describe('interpolateVesselPosition (conservative dead-reckoning)', () => {
  it('returns null when lng or lat is null', () => {
    expect(interpolateVesselPosition(vessel({ lng: null }), 1_715_000_000)).toBeNull();
    expect(interpolateVesselPosition(vessel({ lat: null }), 1_715_000_000)).toBeNull();
  });

  it('returns raw position when sog is at or below the threshold', () => {
    const result = interpolateVesselPosition(vessel({ sog: 0.4 }), 1_715_000_060);
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('returns raw position when both cog and trueHeading are null', () => {
    const result = interpolateVesselPosition(
      vessel({ cog: null, trueHeading: null }),
      1_715_000_060,
    );
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('projects a short distance eastward when course is 90 and dt is small', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 8, cog: 90, lng: 14, lat: 53 }),
      1_715_000_005,
    );
    if (!result) throw new Error('expected position');
    expect(result.lat).toBeCloseTo(53, 6);
    expect(result.lng).toBeGreaterThan(14);
  });

  it('caps projected displacement at 30 m even at full speed', () => {
    // 20 kn × 60 s = 1234 m without cap. With 30 m cap displacement
    // must stay well below 0.0003 deg lat at the equator.
    const result = interpolateVesselPosition(
      vessel({ sog: 20, cog: 0, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_060,
    );
    if (!result) throw new Error('expected position');
    const latDeltaMeters = (result.lat - 53) * 111_000;
    expect(latDeltaMeters).toBeGreaterThan(0);
    expect(latDeltaMeters).toBeLessThanOrEqual(30.5);
  });

  it('freezes on the last raw fix once delta exceeds 60 s', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_120,
    );
    expect(result).toEqual({ lng: 14, lat: 53 });
  });

  it('damps velocity quickly (half-life 30 s)', () => {
    const fresh = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_005,
    );
    const damped = interpolateVesselPosition(
      vessel({ sog: 10, cog: 90, lng: 14, lat: 53, timestampUnix: 1_715_000_000 }),
      1_715_000_045,
    );
    if (!fresh || !damped) throw new Error('expected positions');
    const freshDistance = Math.abs(fresh.lng - 14);
    const dampedDistance = Math.abs(damped.lng - 14);
    expect(dampedDistance).toBeGreaterThan(freshDistance);
    // 45 s of damped motion stays well below a naive linear projection.
    expect(dampedDistance).toBeLessThan(freshDistance * 9);
  });

  it('regression: a Class B vessel with 5 minute staleness stays on its last fix', () => {
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

  it('falls back to raw when nowSeconds precedes the fix', () => {
    const result = interpolateVesselPosition(
      vessel({ timestampUnix: 1_715_000_100 }),
      1_715_000_000,
    );
    expect(result).toEqual({ lng: 14.5528, lat: 53.4285 });
  });

  it('uses trueHeading when cog is null', () => {
    const result = interpolateVesselPosition(
      vessel({ sog: 10, cog: null, trueHeading: 90, lng: 14, lat: 53 }),
      1_715_000_010,
    );
    if (!result) throw new Error('expected position');
    expect(result.lng).toBeGreaterThan(14);
    expect(result.lat).toBeCloseTo(53, 6);
  });
});
