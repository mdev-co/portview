import type { LiveVessel } from '@/modules/telemetry';
import { describe, expect, it } from 'vitest';
import {
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
  AIS_NAV_STATUS_NOT_UNDER_COMMAND,
  AIS_NAV_STATUS_UNDER_WAY_USING_ENGINE,
  type Mmsi,
  SourceId,
  VESSEL_FLAG_IS_MOVING,
} from '@sps/shared';
import { deriveVesselStatus } from '../lib/derive-status';

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_000_000 as Mmsi,
    messageType: 1,
    navStatus: AIS_NAV_STATUS_UNDER_WAY_USING_ENGINE,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: 14,
    lat: 53,
    sog: 5,
    cog: 90,
    trueHeading: 91,
    timestampUnix: 1_715_000_000,
    flags: VESSEL_FLAG_IS_MOVING,
    ...over,
  };
}

describe('deriveVesselStatus', () => {
  it('marks navStatus AT_ANCHOR as anchored regardless of sog or flags', () => {
    expect(
      deriveVesselStatus(
        vessel({ navStatus: AIS_NAV_STATUS_AT_ANCHOR, sog: 8, flags: VESSEL_FLAG_IS_MOVING }),
      ),
    ).toBe('anchored');
  });

  it('marks navStatus MOORED as anchored', () => {
    expect(deriveVesselStatus(vessel({ navStatus: AIS_NAV_STATUS_MOORED }))).toBe('anchored');
  });

  it('marks navStatus NOT_UNDER_COMMAND as nuc', () => {
    expect(deriveVesselStatus(vessel({ navStatus: AIS_NAV_STATUS_NOT_UNDER_COMMAND }))).toBe('nuc');
  });

  it('marks IS_MOVING flag set as underway when navStatus is benign', () => {
    expect(deriveVesselStatus(vessel({ sog: 1.2, flags: VESSEL_FLAG_IS_MOVING }))).toBe('underway');
  });

  it('marks IS_MOVING bit clear as stopped (hysteresis-aware)', () => {
    expect(deriveVesselStatus(vessel({ sog: 0.4, flags: 0 }))).toBe('stopped');
    expect(deriveVesselStatus(vessel({ sog: 0, flags: 0 }))).toBe('stopped');
  });

  it('falls back to anchored when sog is null and the flag is clear', () => {
    expect(deriveVesselStatus(vessel({ sog: null, flags: 0 }))).toBe('anchored');
  });

  it('keeps a vessel underway through the SOG dead zone when the flag stays set', () => {
    // Hysteresis in vessels.store can keep IS_MOVING bit set even at
    // sog 0.4 kn (dead zone). Status follows the bit so map and
    // sidebar agree.
    expect(deriveVesselStatus(vessel({ sog: 0.4, flags: VESSEL_FLAG_IS_MOVING }))).toBe('underway');
  });
});
