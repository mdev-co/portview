import { beforeEach, describe, expect, it } from 'vitest';
import { type Mmsi, SourceId } from '@sps/shared';
import type { LiveVessel } from '../types';
import { $vessels, __test, setVessel, vesselCount } from '../vessels.store';

const FULL: LiveVessel = {
  mmsi: 261_345_678 as Mmsi,
  messageType: 1,
  navStatus: 0,
  sourceId: SourceId.AisStream,
  rateOfTurn: 12,
  lng: 14.5528,
  lat: 53.4285,
  sog: 12.3,
  cog: 217.4,
  trueHeading: 215,
  timestampUnix: 1_715_000_000,
  flags: 0b111,
};

const STATIC_DATA_NULL: LiveVessel = {
  mmsi: 261_345_678 as Mmsi,
  messageType: 5,
  navStatus: null,
  sourceId: SourceId.AisStream,
  rateOfTurn: null,
  lng: null,
  lat: null,
  sog: null,
  cog: null,
  trueHeading: null,
  timestampUnix: 1_715_000_060,
  flags: 0b100,
};

describe('vessels store setVessel', () => {
  beforeEach(() => {
    $vessels.set({});
  });

  it('inserts a new vessel verbatim when no previous record exists', () => {
    setVessel(FULL);
    expect($vessels.get()[FULL.mmsi]).toEqual(FULL);
    expect(vesselCount()).toBe(1);
  });

  it('keeps the previous fix when the inbound frame has null position', () => {
    setVessel(FULL);
    setVessel(STATIC_DATA_NULL);
    const merged = $vessels.get()[FULL.mmsi];
    expect(merged.lng).toBe(FULL.lng);
    expect(merged.lat).toBe(FULL.lat);
    expect(merged.sog).toBe(FULL.sog);
    expect(merged.cog).toBe(FULL.cog);
    expect(merged.trueHeading).toBe(FULL.trueHeading);
    expect(merged.navStatus).toBe(FULL.navStatus);
    expect(merged.rateOfTurn).toBe(FULL.rateOfTurn);
  });

  it('always promotes non-nullable fields from the inbound frame', () => {
    setVessel(FULL);
    setVessel(STATIC_DATA_NULL);
    const merged = $vessels.get()[FULL.mmsi];
    expect(merged.messageType).toBe(STATIC_DATA_NULL.messageType);
    expect(merged.timestampUnix).toBe(STATIC_DATA_NULL.timestampUnix);
    expect(merged.flags).toBe(STATIC_DATA_NULL.flags);
  });

  it('overwrites a non-null inbound value over the previous one', () => {
    setVessel(FULL);
    const moved: LiveVessel = {
      ...FULL,
      lng: 14.6,
      lat: 53.5,
      sog: 5.5,
      timestampUnix: FULL.timestampUnix + 30,
    };
    setVessel(moved);
    const merged = $vessels.get()[FULL.mmsi];
    expect(merged.lng).toBe(14.6);
    expect(merged.lat).toBe(53.5);
    expect(merged.sog).toBe(5.5);
    expect(merged.timestampUnix).toBe(FULL.timestampUnix + 30);
  });

  it('treats only null as the merge sentinel, not zero or false-like values', () => {
    setVessel(FULL);
    const stopped: LiveVessel = { ...FULL, sog: 0, cog: 0, rateOfTurn: 0 };
    setVessel(stopped);
    const merged = $vessels.get()[FULL.mmsi];
    expect(merged.sog).toBe(0);
    expect(merged.cog).toBe(0);
    expect(merged.rateOfTurn).toBe(0);
  });
});

describe('vessels store sweepStale', () => {
  beforeEach(() => {
    $vessels.set({});
  });

  it('drops vessels older than the staleness threshold', () => {
    const now = 1_715_000_000;
    const fresh: LiveVessel = { ...FULL, mmsi: 100 as Mmsi, timestampUnix: now - 30 };
    const stale: LiveVessel = {
      ...FULL,
      mmsi: 200 as Mmsi,
      timestampUnix: now - __test.STALE_THRESHOLD_SECONDS - 5,
    };
    setVessel(fresh);
    setVessel(stale);
    expect(vesselCount()).toBe(2);

    __test.sweepStale(now);
    const remaining = $vessels.get();
    expect(vesselCount()).toBe(1);
    expect(remaining[100]).toBeDefined();
    expect(remaining[200]).toBeUndefined();
  });

  it('keeps vessels exactly at the threshold (not yet stale)', () => {
    const now = 1_715_000_000;
    const onEdge: LiveVessel = {
      ...FULL,
      mmsi: 300 as Mmsi,
      timestampUnix: now - __test.STALE_THRESHOLD_SECONDS,
    };
    setVessel(onEdge);
    __test.sweepStale(now);
    expect($vessels.get()[300]).toBeDefined();
  });

  it('is a no-op when no vessels are stale', () => {
    const now = 1_715_000_000;
    setVessel({ ...FULL, mmsi: 400 as Mmsi, timestampUnix: now - 10 });
    const before = $vessels.get();
    __test.sweepStale(now);
    expect($vessels.get()).toBe(before);
  });
});
