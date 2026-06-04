import { beforeEach, describe, expect, it } from 'vitest';
import { type Mmsi, SourceId, VESSEL_FLAG_HAS_FIX, VESSEL_FLAG_IS_MOVING } from '@sps/shared';
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
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.lng).toBe(FULL.lng);
    expect(merged.lat).toBe(FULL.lat);
    expect(merged.sog).toBe(FULL.sog);
    expect(merged.cog).toBe(FULL.cog);
    expect(merged.trueHeading).toBe(FULL.trueHeading);
    expect(merged.navStatus).toBe(FULL.navStatus);
    expect(merged.rateOfTurn).toBe(FULL.rateOfTurn);
  });

  it('always promotes messageType and timestampUnix from the inbound frame', () => {
    setVessel(FULL);
    setVessel(STATIC_DATA_NULL);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.messageType).toBe(STATIC_DATA_NULL.messageType);
    expect(merged.timestampUnix).toBe(STATIC_DATA_NULL.timestampUnix);
  });

  it('keeps HAS_FIX from the previous frame when the inbound update carries no position (AIS type 5 / 24)', () => {
    // Server-side computeFlags(mmsi, null, null) emits flags without
    // HAS_FIX for static-data frames. A naive merge would erase the
    // HAS_FIX bit set by an earlier position frame and the marker would
    // disappear from the map until the next type 1/2/3/18 broadcast
    // restored it. Verify HAS_FIX is carried forward across static-only
    // updates while non-position bits from the inbound frame still apply.
    setVessel(FULL);
    setVessel(STATIC_DATA_NULL);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_HAS_FIX).toBe(VESSEL_FLAG_HAS_FIX);
  });

  it('uses the inbound flags verbatim when the update carries a fresh position', () => {
    setVessel(FULL);
    const newFlags = 0b101;
    const moved: LiveVessel = {
      ...FULL,
      lng: 14.6,
      lat: 53.5,
      flags: newFlags,
      timestampUnix: FULL.timestampUnix + 30,
    };
    setVessel(moved);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags).toBe(newFlags);
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
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.lng).toBe(14.6);
    expect(merged.lat).toBe(53.5);
    expect(merged.sog).toBe(5.5);
    expect(merged.timestampUnix).toBe(FULL.timestampUnix + 30);
  });

  it('treats only null as the merge sentinel, not zero or false-like values', () => {
    setVessel(FULL);
    const stopped: LiveVessel = { ...FULL, sog: 0, cog: 0, rateOfTurn: 0 };
    setVessel(stopped);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.sog).toBe(0);
    expect(merged.cog).toBe(0);
    expect(merged.rateOfTurn).toBe(0);
  });

  it('keeps IS_MOVING set when SOG dips into the 0.3 to 0.5 kn dead zone', () => {
    // Was clearly moving (sog 12.3 > 0.5), now drifting near a pier at 0.4 kn.
    // The 0.5 kn server threshold alone would strip IS_MOVING and the marker
    // would flicker between underway green and category colour on every
    // borderline report. Hysteresis keeps it green until SOG clearly drops.
    setVessel(FULL);
    const drifting: LiveVessel = { ...FULL, sog: 0.4, flags: 0 };
    setVessel(drifting);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_IS_MOVING).toBe(VESSEL_FLAG_IS_MOVING);
  });

  it('clears IS_MOVING when SOG falls below the 0.3 kn OFF threshold', () => {
    setVessel(FULL);
    const stopped: LiveVessel = { ...FULL, sog: 0.2, flags: 0 };
    setVessel(stopped);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_IS_MOVING).toBe(0);
  });

  it('does not set IS_MOVING when a stopped vessel only edges into the dead zone', () => {
    setVessel({ ...FULL, sog: 0, flags: FULL.flags & ~VESSEL_FLAG_IS_MOVING });
    const edging: LiveVessel = {
      ...FULL,
      sog: 0.4,
      flags: VESSEL_FLAG_IS_MOVING,
    };
    setVessel(edging);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_IS_MOVING).toBe(0);
  });

  it('sets IS_MOVING once SOG clearly exceeds the 0.5 kn ON threshold', () => {
    setVessel({ ...FULL, sog: 0, flags: FULL.flags & ~VESSEL_FLAG_IS_MOVING });
    const accel: LiveVessel = { ...FULL, sog: 0.6, flags: 0 };
    setVessel(accel);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_IS_MOVING).toBe(VESSEL_FLAG_IS_MOVING);
  });

  it('preserves IS_MOVING across static-only frames that carry no SOG', () => {
    setVessel(FULL);
    setVessel(STATIC_DATA_NULL);
    const merged = $vessels.get()[FULL.mmsi]!;
    expect(merged.flags & VESSEL_FLAG_IS_MOVING).toBe(VESSEL_FLAG_IS_MOVING);
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
