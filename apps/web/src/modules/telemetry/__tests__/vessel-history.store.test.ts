import { beforeEach, describe, expect, it } from 'vitest';
import { type Mmsi, SourceId, type VesselHistoryPoint } from '@sps/shared';
import type { LiveVessel } from '../types';
import {
  $vesselKalmanState,
  $vesselPositionHistory,
  __test,
  appendHistoryPoint,
  setHistoryFromSnapshot,
  setKalmanState,
} from '../vessel-history.store';
import { $vessels, setVessel } from '../vessels.store';

// Time anchor used by every test so the trail-age and outlier filters
// operate against a known clock. Tests pass nowSeconds explicitly to
// avoid coupling to Date.now().
const NOW = 1_715_000_500;

function point(over: Partial<VesselHistoryPoint> = {}): VesselHistoryPoint {
  return {
    lng: 14.55,
    lat: 53.42,
    sog: 5,
    cog: 90,
    trueHeading: 90,
    timestampUnix: NOW - 60,
    ...over,
  };
}

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 100 as Mmsi,
    messageType: 1,
    navStatus: 0,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: 14.55,
    lat: 53.42,
    sog: 5,
    cog: 90,
    trueHeading: 90,
    timestampUnix: NOW - 60,
    flags: 0b111,
    ...over,
  };
}

describe('vessel-history.store', () => {
  beforeEach(() => {
    $vesselPositionHistory.set({});
    $vesselKalmanState.set({});
    $vessels.set({});
  });

  it('appends points up to the configured cap and then rolls the buffer', () => {
    // 35 fresh points (1 s apart) all within the age and outlier
    // window. Steps of 1e-5 deg are ~1 m at 53 N, well below the
    // 60 kn outlier threshold.
    for (let i = 0; i < 35; i += 1) {
      appendHistoryPoint(100, point({ lng: 14 + i * 1e-5, timestampUnix: NOW - 35 + i }), NOW);
    }
    const series = $vesselPositionHistory.get()[100]!;
    expect(series).toHaveLength(30);
    expect(series[series.length - 1]!.lng).toBeCloseTo(14 + 34 * 1e-5, 6);
    expect(series[0]!.lng).toBeCloseTo(14 + 5 * 1e-5, 6);
  });

  it('drops history points older than the trail age window', () => {
    appendHistoryPoint(100, point({ timestampUnix: NOW - 600 }), NOW);
    appendHistoryPoint(100, point({ timestampUnix: NOW - 30 }), NOW);
    const series = $vesselPositionHistory.get()[100]!;
    expect(series).toHaveLength(1);
    expect(series[0]!.timestampUnix).toBe(NOW - 30);
  });

  it('rejects an outlier append more than 60 kn away from the prior fix', () => {
    appendHistoryPoint(100, point({ lng: 14.55, lat: 53.42, timestampUnix: NOW - 30 }), NOW);
    // 1 degree of longitude (~67 km at 53 N) over 5 seconds is impossible.
    appendHistoryPoint(100, point({ lng: 15.55, lat: 53.42, timestampUnix: NOW - 25 }), NOW);
    const series = $vesselPositionHistory.get()[100]!;
    expect(series).toHaveLength(1);
    expect(series[0]!.lng).toBeCloseTo(14.55, 4);
  });

  it('accepts a slightly out-of-order point (AisStream sub sampling tolerance)', () => {
    appendHistoryPoint(100, point({ timestampUnix: NOW - 30 }), NOW);
    appendHistoryPoint(100, point({ timestampUnix: NOW - 60 }), NOW);
    // Both points kept; out-of-order is not by itself a reason to drop.
    // The outlier check still applies on distance / max-speed.
    const series = $vesselPositionHistory.get()[100]!;
    expect(series).toHaveLength(2);
  });

  it('replaces history from a snapshot and trims to the cap', () => {
    const oversized: VesselHistoryPoint[] = Array.from({ length: 40 }, (_, i) =>
      point({ lng: 10 + i / 1_000, timestampUnix: NOW - 40 + i }),
    );
    setHistoryFromSnapshot(200, oversized, NOW);
    const series = $vesselPositionHistory.get()[200]!;
    expect(series).toHaveLength(30);
    expect(series[0]!.lng).toBeCloseTo(10 + 10 / 1_000, 4);
    expect(series[series.length - 1]!.lng).toBeCloseTo(10 + 39 / 1_000, 4);
  });

  it('sweeps history and Kalman entries whose vessel is no longer live', () => {
    appendHistoryPoint(100, point(), NOW);
    appendHistoryPoint(200, point(), NOW);
    setKalmanState(100, {
      lng: 14,
      lat: 53,
      vlng: 0,
      vlat: 0,
      covariance: new Array(16).fill(0),
      updatedAtUnix: NOW - 60,
    });
    setKalmanState(200, {
      lng: 14,
      lat: 53,
      vlng: 0,
      vlat: 0,
      covariance: new Array(16).fill(0),
      updatedAtUnix: NOW - 60,
    });
    setVessel(vessel({ mmsi: 200 as Mmsi }));
    __test.sweepOrphans(NOW);
    expect($vesselPositionHistory.get()[100]).toBeUndefined();
    expect($vesselPositionHistory.get()[200]).toBeDefined();
    expect($vesselKalmanState.get()[100]).toBeUndefined();
    expect($vesselKalmanState.get()[200]).toBeDefined();
  });
});
