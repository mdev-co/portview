import type { LiveVessel } from '@/modules/telemetry';
import { describe, expect, it } from 'vitest';
import {
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
  AIS_NAV_STATUS_NOT_UNDER_COMMAND,
  AIS_NAV_STATUS_UNDER_WAY_USING_ENGINE,
  SourceId,
} from '@sps/shared';
import { deriveVesselStatus } from '../lib/derive-status';

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_000_000,
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
    flags: 0,
    ...over,
  };
}

describe('deriveVesselStatus', () => {
  it('marks navStatus AT_ANCHOR as anchored regardless of sog', () => {
    expect(deriveVesselStatus(vessel({ navStatus: AIS_NAV_STATUS_AT_ANCHOR, sog: 8 }))).toBe(
      'anchored',
    );
  });

  it('marks navStatus MOORED as anchored', () => {
    expect(deriveVesselStatus(vessel({ navStatus: AIS_NAV_STATUS_MOORED }))).toBe('anchored');
  });

  it('marks navStatus NOT_UNDER_COMMAND as nuc', () => {
    expect(deriveVesselStatus(vessel({ navStatus: AIS_NAV_STATUS_NOT_UNDER_COMMAND }))).toBe('nuc');
  });

  it('marks sog above threshold as underway when navStatus is benign', () => {
    expect(deriveVesselStatus(vessel({ sog: 1.2 }))).toBe('underway');
  });

  it('marks sog at or below threshold as stopped', () => {
    expect(deriveVesselStatus(vessel({ sog: 0.4 }))).toBe('stopped');
    expect(deriveVesselStatus(vessel({ sog: 0 }))).toBe('stopped');
  });

  it('falls back to anchored when sog is null', () => {
    expect(deriveVesselStatus(vessel({ sog: null }))).toBe('anchored');
  });
});
