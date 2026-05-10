import {
  type ClassBStaticData,
  SourceId,
  VESSEL_STATIC_FRAME_KIND,
  type StaticData,
} from '@sps/shared';
import type { VesselStaticEvent } from '../ingest/ingest.events';
import { buildVesselStaticFrame } from './static-builder';

const RECEIVED_AT = 1_715_000_000_500;

const STATIC_MESSAGE: StaticData = {
  messageType: 5,
  repeatIndicator: 0,
  mmsi: 261_345_678,
  aisVersion: 0,
  imo: 9_725_634,
  callSign: 'SXFG',
  vesselName: 'TRIESTE',
  shipType: 70,
  dimensions: { toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 },
  epfdType: 0,
  eta: { month: 5, day: 12, hour: 14, minute: 30 },
  draught: 7.4,
  destination: 'GDYNIA',
  dte: false,
};

function makeEvent(
  overrides: Partial<VesselStaticEvent> = {},
): VesselStaticEvent {
  return {
    message: STATIC_MESSAGE,
    sourceId: SourceId.AisStream,
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

describe('buildVesselStaticFrame', () => {
  it('maps StaticData fields into the wire frame and stamps the discriminator', () => {
    const frame = buildVesselStaticFrame(makeEvent());

    expect(frame).toEqual({
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
      receivedAt: RECEIVED_AT,
    });
  });

  it('omits the upstream-only fields the FE never reads', () => {
    const frame = buildVesselStaticFrame(makeEvent());
    const keys = Object.keys(frame).sort();
    expect(keys).not.toContain('repeatIndicator');
    expect(keys).not.toContain('aisVersion');
    expect(keys).not.toContain('epfdType');
    expect(keys).not.toContain('dte');
  });

  it('passes through null draught and null imo unchanged', () => {
    const frame = buildVesselStaticFrame(
      makeEvent({
        message: { ...STATIC_MESSAGE, draught: null, imo: null },
      }),
    );
    expect(frame.draught).toBeNull();
    expect(frame.imo).toBeNull();
  });
});

const CLASS_B_PART_A: ClassBStaticData = {
  messageType: 24,
  repeatIndicator: 0,
  mmsi: 261_999_999,
  partNumber: 0,
  vesselName: 'WIATR PD',
  callSign: '',
  shipType: 0,
  dimensions: null,
  vendorId: '',
  mothershipMmsi: null,
};

const CLASS_B_PART_B: ClassBStaticData = {
  messageType: 24,
  repeatIndicator: 0,
  mmsi: 261_999_999,
  partNumber: 1,
  vesselName: '',
  callSign: 'SQABCD',
  shipType: 36,
  dimensions: { toBow: 6, toStern: 3, toPort: 1, toStarboard: 1 },
  vendorId: 'GAR',
  mothershipMmsi: null,
};

describe('buildVesselStaticFrame for Class B (type 24)', () => {
  it('PartA produces a frame with vesselName populated and Class A fields nulled out', () => {
    const frame = buildVesselStaticFrame({
      message: CLASS_B_PART_A,
      sourceId: SourceId.AisStream,
      receivedAt: RECEIVED_AT,
    });

    expect(frame.vesselName).toBe('WIATR PD');
    expect(frame.callSign).toBe('');
    expect(frame.shipType).toBe(0);
    expect(frame.dimensions).toBeNull();
    expect(frame.imo).toBeNull();
    expect(frame.draught).toBeNull();
    expect(frame.destination).toBe('');
    expect(frame.eta).toEqual({
      month: null,
      day: null,
      hour: null,
      minute: null,
    });
    expect(frame.kind).toBe(VESSEL_STATIC_FRAME_KIND);
  });

  it('PartB produces a frame with callSign and dimensions populated and name empty', () => {
    const frame = buildVesselStaticFrame({
      message: CLASS_B_PART_B,
      sourceId: SourceId.AisStream,
      receivedAt: RECEIVED_AT,
    });

    expect(frame.vesselName).toBe('');
    expect(frame.callSign).toBe('SQABCD');
    expect(frame.shipType).toBe(36);
    expect(frame.dimensions).toEqual({
      toBow: 6,
      toStern: 3,
      toPort: 1,
      toStarboard: 1,
    });
    expect(frame.imo).toBeNull();
    expect(frame.draught).toBeNull();
    expect(frame.destination).toBe('');
  });

  it('Class B always leaves IMO, draught, destination and eta unset (Class B has no voyage data)', () => {
    const partA = buildVesselStaticFrame({
      message: CLASS_B_PART_A,
      sourceId: SourceId.AisStream,
      receivedAt: RECEIVED_AT,
    });
    const partB = buildVesselStaticFrame({
      message: CLASS_B_PART_B,
      sourceId: SourceId.AisStream,
      receivedAt: RECEIVED_AT,
    });
    for (const frame of [partA, partB]) {
      expect(frame.imo).toBeNull();
      expect(frame.draught).toBeNull();
      expect(frame.destination).toBe('');
      expect(frame.eta).toEqual({
        month: null,
        day: null,
        hour: null,
        minute: null,
      });
    }
  });
});
