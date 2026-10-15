import type { VesselListResponse, VesselSummary } from '@/lib/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Mmsi,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
} from '@sps/shared';
import { $archiveAnchorUnix, displayNowSeconds } from '../archive-clock';
import { maybeSeedArchive, __test as snapshotTest } from '../archive-snapshot';
import type { LiveVessel } from '../types';
import { $vesselStaticData } from '../vessel-static.store';
import { $vessels, setVessel, __test as storeTest } from '../vessels.store';

const ANCHOR = 1_791_000_000;
const TEN_DAYS_LATER = ANCHOR + 10 * 86_400;

function summary(
  mmsi: number,
  ageSeconds: number,
  overrides: Partial<VesselSummary> = {},
): VesselSummary {
  const at = new Date((ANCHOR - ageSeconds) * 1_000).toISOString();
  return {
    mmsi,
    imo: null,
    name: `VESSEL ${String(mmsi)}`,
    callSign: 'SP1234',
    shipType: 70,
    destination: 'SZCZECIN',
    eta: null,
    lastSeenAt: at,
    position: {
      lat: 53.43,
      lng: 14.55,
      speedOverGround: 6.2,
      courseOverGround: 120,
      trueHeading: 118,
      navStatus: 0,
      updatedAt: at,
    },
    kalmanState: null,
    ...overrides,
  };
}

function respondWith(vessels: VesselSummary[]) {
  return vi.fn(() => Promise.resolve<VesselListResponse>({ vessels }));
}

function liveFrame(timestampUnix: number): LiveVessel {
  return {
    mmsi: 261_999_999 as Mmsi,
    messageType: 1,
    navStatus: 0,
    sourceId: SourceId.EdgeBridge,
    rateOfTurn: null,
    lng: 14.6,
    lat: 53.4,
    sog: 0,
    cog: null,
    trueHeading: null,
    timestampUnix,
    flags: VESSEL_FLAG_HAS_FIX,
  };
}

beforeEach(() => {
  $vessels.set({});
  $vesselStaticData.set({});
  $archiveAnchorUnix.set(null);
});

describe('maybeSeedArchive', () => {
  it('pins the clock to the newest fix and seeds only fixes inside the eviction window', async () => {
    const fetcher = respondWith([
      summary(261_000_001, 0),
      summary(261_000_002, 300),
      summary(261_000_003, 3_600),
      summary(261_000_004, 0, { position: null }),
    ]);

    await expect(maybeSeedArchive(fetcher, TEN_DAYS_LATER)).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(snapshotTest.ARCHIVE_FETCH_LIMIT);
    expect($archiveAnchorUnix.get()).toBe(ANCHOR);
    expect(Object.keys($vessels.get()).map(Number).sort()).toEqual([261_000_001, 261_000_002]);
    const seeded = $vessels.get()[261_000_001];
    expect(seeded?.sourceId).toBe(SourceId.EdgeBridge);
    expect(seeded?.timestampUnix).toBe(ANCHOR);
    expect(seeded?.flags).toBe(
      VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_IS_MOVING | VESSEL_FLAG_HAS_IDENTITY,
    );
    expect($vesselStaticData.get()[261_000_001]?.vesselName).toBe('VESSEL 261000001');
  });

  it('falls back to the persisted Kalman fix when the position row is gone', async () => {
    const at = new Date(ANCHOR * 1_000).toISOString();
    const fetcher = respondWith([
      summary(261_000_005, 0, {
        position: null,
        kalmanState: { lng: 14.59, lat: 53.45, vlng: 0, vlat: 0, updatedAt: at },
      }),
    ]);

    await expect(maybeSeedArchive(fetcher, TEN_DAYS_LATER)).resolves.toBe(true);

    const seeded = $vessels.get()[261_000_005];
    expect(seeded?.lng).toBe(14.59);
    expect(seeded?.lat).toBe(53.45);
    expect(seeded?.sog).toBeNull();
    expect(seeded?.flags).toBe(VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_HAS_IDENTITY);
  });

  it('does nothing while the live feed is delivering', async () => {
    setVessel(liveFrame(TEN_DAYS_LATER));
    const fetcher = respondWith([summary(261_000_001, 0)]);

    await expect(maybeSeedArchive(fetcher, TEN_DAYS_LATER)).resolves.toBe(false);

    expect(fetcher).not.toHaveBeenCalled();
    expect($archiveAnchorUnix.get()).toBeNull();
  });

  it('does nothing when the newest fix is still fresh', async () => {
    const fetcher = respondWith([summary(261_000_001, 0)]);

    await expect(maybeSeedArchive(fetcher, ANCHOR + 60)).resolves.toBe(false);

    expect($archiveAnchorUnix.get()).toBeNull();
    expect($vessels.get()).toEqual({});
  });
});

describe('pinned display clock', () => {
  it('keeps the snapshot through the stale sweep while pinned', async () => {
    await maybeSeedArchive(respondWith([summary(261_000_001, 0)]), TEN_DAYS_LATER);

    storeTest.sweepStale();

    expect(displayNowSeconds()).toBe(ANCHOR);
    expect(Object.keys($vessels.get())).toHaveLength(1);
  });

  it('unpins on the first live frame and lets the sweep evict the snapshot', async () => {
    const stopListening = snapshotTest.unpinOnLiveFrame();
    await maybeSeedArchive(
      respondWith([summary(261_000_001, 0), summary(261_000_002, 120)]),
      TEN_DAYS_LATER,
    );
    expect($archiveAnchorUnix.get()).toBe(ANCHOR);

    setVessel(liveFrame(TEN_DAYS_LATER));
    storeTest.sweepStale(TEN_DAYS_LATER);

    expect($archiveAnchorUnix.get()).toBeNull();
    expect(Object.keys($vessels.get()).map(Number)).toEqual([261_999_999]);
    stopListening();
  });
});
