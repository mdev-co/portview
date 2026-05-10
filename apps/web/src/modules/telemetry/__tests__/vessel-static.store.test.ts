import { beforeEach, describe, expect, it } from 'vitest';
import { SourceId, VESSEL_STATIC_FRAME_KIND, type VesselStaticDataFrame } from '@sps/shared';
import type { LiveVessel } from '../types';
import {
  $vesselStaticData,
  __test,
  setVesselStatic,
  vesselStaticCount,
} from '../vessel-static.store';
import { $vessels, setVessel } from '../vessels.store';

const FRAME: VesselStaticDataFrame = {
  kind: VESSEL_STATIC_FRAME_KIND,
  mmsi: 261_345_678,
  vesselName: 'TRIESTE',
  imo: 9_725_634,
  callSign: 'SXFG',
  shipType: 70,
  dimensions: { toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 },
  draught: 7.4,
  destination: 'GDYNIA',
  eta: { month: 5, day: 12, hour: 14, minute: 30 },
  receivedAt: 1_715_000_000_000,
};

describe('vessel-static store', () => {
  beforeEach(() => {
    $vesselStaticData.set({});
    $vessels.set({});
  });

  it('keys frames by mmsi', () => {
    setVesselStatic(FRAME);
    expect($vesselStaticData.get()[FRAME.mmsi]).toEqual(FRAME);
    expect(vesselStaticCount()).toBe(1);
  });

  it('replaces a previous entry on the same mmsi', () => {
    setVesselStatic(FRAME);
    const next: VesselStaticDataFrame = { ...FRAME, destination: 'TRIESTE', draught: 8.1 };
    setVesselStatic(next);
    expect($vesselStaticData.get()[FRAME.mmsi]).toEqual(next);
    expect(vesselStaticCount()).toBe(1);
  });
});

const LIVE: LiveVessel = {
  mmsi: FRAME.mmsi,
  messageType: 1,
  navStatus: 0,
  sourceId: SourceId.AisStream,
  rateOfTurn: null,
  lng: 14.5,
  lat: 53.4,
  sog: 10,
  cog: 90,
  trueHeading: 91,
  timestampUnix: 1_715_000_000,
  flags: 0b111,
};

describe('vessel-static store sweepOrphans', () => {
  beforeEach(() => {
    $vesselStaticData.set({});
    $vessels.set({});
  });

  it('drops static entries whose mmsi has been evicted from $vessels', () => {
    setVessel(LIVE);
    setVesselStatic(FRAME);
    expect(vesselStaticCount()).toBe(1);

    $vessels.set({});
    __test.sweepOrphans();
    expect(vesselStaticCount()).toBe(0);
  });

  it('keeps static entries whose vessel is still live', () => {
    setVessel(LIVE);
    setVesselStatic(FRAME);

    __test.sweepOrphans();
    expect($vesselStaticData.get()[FRAME.mmsi]).toEqual(FRAME);
  });

  it('is a no-op when nothing is orphaned', () => {
    setVessel(LIVE);
    setVesselStatic(FRAME);
    const before = $vesselStaticData.get();

    __test.sweepOrphans();
    expect($vesselStaticData.get()).toBe(before);
  });
});
