import { beforeEach, describe, expect, it } from 'vitest';
import { SourceId } from '@sps/shared';
import type { LiveVessel } from '../../../telemetry/types';
import {
  __resetTrackerForTests,
  pruneTrackerState,
  smoothedDisplayPosition,
} from '../dead-reckoning-tracker';

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_000_000,
    messageType: 1,
    navStatus: 0,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: 14,
    lat: 53,
    sog: 0,
    cog: 0,
    trueHeading: 0,
    timestampUnix: 1_000,
    flags: 0,
    ...over,
  };
}

describe('smoothedDisplayPosition', () => {
  beforeEach(() => {
    __resetTrackerForTests();
  });

  it('snaps to target on first sighting of a vessel', () => {
    const result = smoothedDisplayPosition(vessel({ lng: 14, lat: 53 }), 1_000, 0);
    expect(result).toEqual({ lng: 14, lat: 53 });
  });

  it('lerps from previous displayed to new target across the transition window', () => {
    const v1 = vessel({ mmsi: 1, lng: 14, lat: 53, timestampUnix: 1_000 });
    smoothedDisplayPosition(v1, 1_000, 0);

    const v2 = vessel({ mmsi: 1, lng: 15, lat: 53, timestampUnix: 1_010, sog: 0 });
    smoothedDisplayPosition(v2, 1_010, 0);

    const halfway = smoothedDisplayPosition(v2, 1_010, 750);
    expect(halfway?.lng).toBeCloseTo(14.5, 2);

    const settled = smoothedDisplayPosition(v2, 1_010, 1_500);
    expect(settled?.lng).toBeCloseTo(15, 2);
  });

  it('keeps following dead-reckoning target after transition ends', () => {
    const v1 = vessel({
      mmsi: 2,
      lng: 14,
      lat: 53,
      sog: 10,
      cog: 90,
      timestampUnix: 1_000,
    });
    smoothedDisplayPosition(v1, 1_000, 0);
    const later = smoothedDisplayPosition(v1, 1_005, 5_000);
    expect(later?.lng).toBeGreaterThan(14);
  });

  it('returns null when interpolated position is null', () => {
    const result = smoothedDisplayPosition(vessel({ lng: null }), 1_000, 0);
    expect(result).toBeNull();
  });

  it('snaps displayed position to current target after a long tick gap (paused frame loop)', () => {
    const v1 = vessel({
      mmsi: 9,
      lng: 14,
      lat: 53,
      sog: 10,
      cog: 90,
      timestampUnix: 1_000,
    });
    smoothedDisplayPosition(v1, 1_000, 0);
    smoothedDisplayPosition(v1, 1_001, 100);
    // Simulate a 2-second pause (tab background, map pan, GC)
    const afterPause = smoothedDisplayPosition(v1, 1_003, 2_100);
    if (!afterPause) throw new Error('expected position');
    // Should match the dead-reckoning target at t=3, not torpedo forward
    // by 2 seconds of accumulated frame work.
    const stillFollowing = smoothedDisplayPosition(v1, 1_004, 2_120);
    expect(stillFollowing).not.toBeNull();
    expect(afterPause.lng).toBeGreaterThan(14);
  });

  it('keeps the original transition start when a new report arrives mid-lerp so burst updates do not stall the animation', () => {
    const v1 = vessel({ lng: 14, lat: 53, timestampUnix: 1_000 });
    smoothedDisplayPosition(v1, 1_000, 0);

    const v2 = vessel({ lng: 15, lat: 53, timestampUnix: 1_010, sog: 0 });
    smoothedDisplayPosition(v2, 1_010, 0);

    const v3 = vessel({ lng: 16, lat: 53, timestampUnix: 1_011, sog: 0 });
    smoothedDisplayPosition(v3, 1_011, 500);

    // 1500ms after the FIRST transition started, displayed must reach the
    // freshest target (16), not a partially-lerped value caused by a
    // restart-from-stale-start that the previous implementation produced.
    const settled = smoothedDisplayPosition(v3, 1_011, 1_500);
    expect(settled?.lng).toBeCloseTo(16, 2);
  });

  it('pruneTrackerState drops state for MMSIs not in the active set', () => {
    smoothedDisplayPosition(vessel({ mmsi: 100 }), 1_000, 0);
    smoothedDisplayPosition(vessel({ mmsi: 200 }), 1_000, 0);
    pruneTrackerState(new Set([200]));
    smoothedDisplayPosition(vessel({ mmsi: 100, lng: 99, lat: 99 }), 1_000, 0);
    const result = smoothedDisplayPosition(vessel({ mmsi: 100, lng: 99, lat: 99 }), 1_000, 0);
    expect(result).toEqual({ lng: 99, lat: 99 });
  });
});
