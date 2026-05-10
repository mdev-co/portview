import {
  type AisMessage,
  type Imo,
  type Mmsi,
  type ShipTypeCode,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  decodeVesselFrame,
  encodeVesselFrame,
} from '@sps/shared';
import { buildVesselFrame } from './frame-builder';

const RECEIVED_AT = 1_715_000_000_500;
const TIMESTAMP_UNIX = Math.floor(RECEIVED_AT / 1000);

const POSITION_REPORT: AisMessage = {
  messageType: 1,
  repeatIndicator: 0,
  mmsi: 261_345_678 as Mmsi,
  navigationStatus: 0,
  rateOfTurn: 12,
  speedOverGround: 12.3,
  positionAccuracy: false,
  position: [14.5528, 53.4285],
  courseOverGround: 217.4,
  trueHeading: 215,
  timestamp: null,
  maneuverIndicator: 0,
  raim: false,
  radioStatus: 0,
};

const CLASS_B_POSITION: AisMessage = {
  messageType: 18,
  repeatIndicator: 0,
  mmsi: 261_111_111 as Mmsi,
  speedOverGround: 5.5,
  positionAccuracy: true,
  position: [14.6, 53.5],
  courseOverGround: 90,
  trueHeading: 91,
  timestamp: 30,
  csUnit: false,
  displayFlag: false,
  dscFlag: false,
  bandFlag: false,
  message22Flag: false,
  assignedFlag: false,
  raim: false,
  radioStatus: 0,
};

const STATIC_DATA: AisMessage = {
  messageType: 5,
  repeatIndicator: 0,
  mmsi: 261_222_222 as Mmsi,
  aisVersion: 0,
  imo: 9_074_729 as Imo,
  callSign: '',
  vesselName: '',
  shipType: 70 as ShipTypeCode,
  dimensions: null,
  epfdType: 1,
  eta: { month: null, day: null, hour: null, minute: null },
  draught: null,
  destination: '',
  dte: false,
};

describe('buildVesselFrame', () => {
  it('extracts every spatial field from a Class A position report', () => {
    const frame = buildVesselFrame({
      message: POSITION_REPORT,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame).toEqual({
      messageType: 1,
      mmsi: 261_345_678,
      navStatus: 0,
      sourceId: SourceId.LocalUdp,
      rateOfTurn: 12,
      lng: 14.5528,
      lat: 53.4285,
      sog: 12.3,
      cog: 217.4,
      trueHeading: 215,
      timestampUnix: TIMESTAMP_UNIX,
      flags:
        VESSEL_FLAG_IS_MOVING | VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_HAS_IDENTITY,
      reserved: 0,
    });
  });

  it('clears isMoving when sog is at or below the 0.5 kn threshold', () => {
    const slow = { ...POSITION_REPORT, speedOverGround: 0.4 } as AisMessage;
    const frame = buildVesselFrame({
      message: slow,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.flags & VESSEL_FLAG_IS_MOVING).toBe(0);
    expect(frame.flags & VESSEL_FLAG_HAS_FIX).toBe(VESSEL_FLAG_HAS_FIX);
  });

  it('clears hasFix and isMoving when position is null', () => {
    const noFix = {
      ...POSITION_REPORT,
      position: null,
      speedOverGround: 10,
    } as AisMessage;
    const frame = buildVesselFrame({
      message: noFix,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.flags & VESSEL_FLAG_HAS_FIX).toBe(0);
    expect(frame.flags & VESSEL_FLAG_IS_MOVING).toBe(VESSEL_FLAG_IS_MOVING);
  });

  it('clears hasIdentity for mmsi outside the 200..799 MID region', () => {
    const auxiliary = {
      ...POSITION_REPORT,
      mmsi: 99_345_678 as Mmsi,
    } as AisMessage;
    const frame = buildVesselFrame({
      message: auxiliary,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.flags & VESSEL_FLAG_HAS_IDENTITY).toBe(0);
  });

  it('blanks navStatus and rateOfTurn for a Class B report', () => {
    const frame = buildVesselFrame({
      message: CLASS_B_POSITION,
      sourceId: SourceId.AisStream,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.messageType).toBe(18);
    expect(frame.navStatus).toBeNull();
    expect(frame.rateOfTurn).toBeNull();
    expect(frame.lng).toBe(14.6);
    expect(frame.lat).toBe(53.5);
    expect(frame.sourceId).toBe(SourceId.AisStream);
  });

  it('emits a position-less frame for static data (type 5)', () => {
    const frame = buildVesselFrame({
      message: STATIC_DATA,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.messageType).toBe(5);
    expect(frame.lat).toBeNull();
    expect(frame.lng).toBeNull();
    expect(frame.sog).toBeNull();
    expect(frame.cog).toBeNull();
    expect(frame.mmsi).toBe(STATIC_DATA.mmsi);
  });

  it('produces a frame that round-trips through encode + decode', () => {
    const built = buildVesselFrame({
      message: POSITION_REPORT,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    const decoded = decodeVesselFrame(encodeVesselFrame(built));
    expect(decoded.mmsi).toBe(built.mmsi);
    expect(decoded.lng).toBeCloseTo(built.lng!, 9);
    expect(decoded.lat).toBeCloseTo(built.lat!, 9);
    expect(decoded.timestampUnix).toBe(built.timestampUnix);
  });

  it('floors a sub-second receivedAt to integer timestampUnix', () => {
    const frame = buildVesselFrame({
      message: POSITION_REPORT,
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_715_000_000_999,
    });
    expect(frame.timestampUnix).toBe(1_715_000_000);
  });

  it('returns null position when the message has no fix', () => {
    const noFix = { ...POSITION_REPORT, position: null } as AisMessage;
    const frame = buildVesselFrame({
      message: noFix,
      sourceId: SourceId.LocalUdp,
      receivedAt: RECEIVED_AT,
    });
    expect(frame.lng).toBeNull();
    expect(frame.lat).toBeNull();
  });
});
