import type { LiveVessel } from '@/modules/telemetry';
import { describe, expect, it } from 'vitest';
import { VESSEL_STATIC_FRAME_KIND, type VesselStaticDataFrame } from '@sps/shared';
import { compareVesselsForSidebar } from '../lib/sort-vessels';

function vessel(mmsi: number, timestampUnix = 1_700_000_000): LiveVessel {
  return {
    mmsi,
    messageType: 1,
    navStatus: null,
    sourceId: 0,
    rateOfTurn: null,
    lng: null,
    lat: null,
    sog: null,
    cog: null,
    trueHeading: null,
    timestampUnix,
    flags: 0,
  } as unknown as LiveVessel;
}

function staticFrame(mmsi: number, vesselName: string): VesselStaticDataFrame {
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: mmsi as VesselStaticDataFrame['mmsi'],
    vesselName,
    imo: null,
    callSign: '',
    shipType: 0 as VesselStaticDataFrame['shipType'],
    dimensions: null,
    draught: null,
    destination: '',
    eta: { month: null, day: null, hour: null, minute: null },
    receivedAt: 0,
  };
}

const A = 211_100_000;
const B = 211_200_000;
const C = 211_300_000;

describe('compareVesselsForSidebar', () => {
  it('places vessels with a known name ahead of unknown-name vessels', () => {
    const list = [vessel(A), vessel(B), vessel(C)];
    const staticData = { [B]: staticFrame(B, 'ALPHA') };
    list.sort((x, y) => compareVesselsForSidebar(x, y, staticData));
    expect(list.map(v => v.mmsi)).toEqual([B, A, C]);
  });

  it('sorts known names alphabetically (case-insensitive)', () => {
    const list = [vessel(A), vessel(B), vessel(C)];
    const staticData = {
      [A]: staticFrame(A, 'charlie'),
      [B]: staticFrame(B, 'Alpha'),
      [C]: staticFrame(C, 'BRAVO'),
    };
    list.sort((x, y) => compareVesselsForSidebar(x, y, staticData));
    expect(list.map(v => v.mmsi)).toEqual([B, C, A]);
  });

  it('breaks name ties by ascending MMSI', () => {
    const list = [vessel(C), vessel(A), vessel(B)];
    const staticData = {
      [A]: staticFrame(A, 'SAME'),
      [B]: staticFrame(B, 'SAME'),
      [C]: staticFrame(C, 'SAME'),
    };
    list.sort((x, y) => compareVesselsForSidebar(x, y, staticData));
    expect(list.map(v => v.mmsi)).toEqual([A, B, C]);
  });

  it('sorts vessels without static data by MMSI ascending', () => {
    const list = [vessel(C), vessel(A), vessel(B)];
    list.sort((x, y) => compareVesselsForSidebar(x, y, {}));
    expect(list.map(v => v.mmsi)).toEqual([A, B, C]);
  });

  it('treats an all-whitespace vessel name as missing', () => {
    const list = [vessel(A), vessel(B)];
    const staticData = {
      [A]: staticFrame(A, '   '),
      [B]: staticFrame(B, 'ANYTHING'),
    };
    list.sort((x, y) => compareVesselsForSidebar(x, y, staticData));
    expect(list.map(v => v.mmsi)).toEqual([B, A]);
  });

  it('order does not depend on timestampUnix differences', () => {
    const fresh = vessel(C, 9_999_999_999);
    const stale = vessel(A, 1_000_000_000);
    const mid = vessel(B, 5_000_000_000);
    const list = [fresh, stale, mid];
    const staticData = {
      [A]: staticFrame(A, 'ALPHA'),
      [B]: staticFrame(B, 'BRAVO'),
      [C]: staticFrame(C, 'CHARLIE'),
    };
    list.sort((x, y) => compareVesselsForSidebar(x, y, staticData));
    expect(list.map(v => v.mmsi)).toEqual([A, B, C]);
  });
});
