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

  it('merges Class B PartA followed by PartB into a complete record', () => {
    const mmsi = 261_999_999;
    const partA: VesselStaticDataFrame = {
      kind: 'vessel.static',
      mmsi,
      vesselName: 'WIATR PD',
      callSign: '',
      shipType: 0,
      dimensions: null,
      imo: null,
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_715_000_000_000,
    };
    const partB: VesselStaticDataFrame = {
      kind: 'vessel.static',
      mmsi,
      vesselName: '',
      callSign: 'SQABCD',
      shipType: 36,
      dimensions: { toBow: 6, toStern: 3, toPort: 1, toStarboard: 1 },
      imo: null,
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_715_000_000_500,
    };

    setVesselStatic(partA);
    setVesselStatic(partB);

    const merged = $vesselStaticData.get()[mmsi];
    expect(merged?.vesselName).toBe('WIATR PD');
    expect(merged?.callSign).toBe('SQABCD');
    expect(merged?.shipType).toBe(36);
    expect(merged?.dimensions).toEqual({ toBow: 6, toStern: 3, toPort: 1, toStarboard: 1 });
  });

  it('merge order does not matter: PartB before PartA still yields the full record', () => {
    const mmsi = 261_888_888;
    const partA: VesselStaticDataFrame = {
      kind: 'vessel.static',
      mmsi,
      vesselName: 'NIETOPERZ',
      callSign: '',
      shipType: 0,
      dimensions: null,
      imo: null,
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_715_000_001_000,
    };
    const partB: VesselStaticDataFrame = {
      kind: 'vessel.static',
      mmsi,
      vesselName: '',
      callSign: 'SQXY',
      shipType: 37,
      dimensions: { toBow: 4, toStern: 2, toPort: 1, toStarboard: 1 },
      imo: null,
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_715_000_000_500,
    };

    setVesselStatic(partB);
    setVesselStatic(partA);

    const merged = $vesselStaticData.get()[mmsi];
    expect(merged?.vesselName).toBe('NIETOPERZ');
    expect(merged?.callSign).toBe('SQXY');
    expect(merged?.shipType).toBe(37);
    expect(merged?.dimensions).toEqual({ toBow: 4, toStern: 2, toPort: 1, toStarboard: 1 });
  });

  it('a full Class A type 5 frame replaces blank fields without dropping non-blank prev fields', () => {
    const mmsi = 261_777_777;
    setVesselStatic({
      kind: 'vessel.static',
      mmsi,
      vesselName: 'OLD NAME',
      callSign: 'OLDCS',
      shipType: 70,
      dimensions: { toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 },
      imo: 9_111_111,
      draught: 7.4,
      destination: 'GDYNIA',
      eta: { month: 5, day: 12, hour: 14, minute: 30 },
      receivedAt: 1_715_000_000_000,
    });
    setVesselStatic({
      kind: 'vessel.static',
      mmsi,
      vesselName: 'NEW NAME',
      callSign: 'NEWCS',
      shipType: 80,
      dimensions: { toBow: 110, toStern: 90, toPort: 16, toStarboard: 16 },
      imo: 9_222_222,
      draught: 8.0,
      destination: 'HAMBURG',
      eta: { month: 6, day: 1, hour: 8, minute: 0 },
      receivedAt: 1_715_000_001_000,
    });
    const merged = $vesselStaticData.get()[mmsi];
    expect(merged?.vesselName).toBe('NEW NAME');
    expect(merged?.callSign).toBe('NEWCS');
    expect(merged?.shipType).toBe(80);
    expect(merged?.destination).toBe('HAMBURG');
    expect(merged?.imo).toBe(9_222_222);
    expect(merged?.draught).toBe(8.0);
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
