import { describe, expect, it } from 'vitest';
import type { ClassBPositionReport } from '../../types/class-b-position';
import type { StaticData } from '../../types/static-data';
import type { PositionReport } from '../../types/vessel';
import { validateAisMessage } from '../ais-message';

const VALID_MMSI = 261_345_678;
const VALID_IMO = 9_074_729;

const baseType1: PositionReport = {
  messageType: 1,
  repeatIndicator: 0,
  mmsi: VALID_MMSI,
  navigationStatus: 0,
  rateOfTurn: null,
  speedOverGround: null,
  positionAccuracy: false,
  position: [14.5528, 53.4285],
  courseOverGround: null,
  trueHeading: null,
  timestamp: null,
  maneuverIndicator: 0,
  raim: false,
  radioStatus: 0,
};

const baseType5: StaticData = {
  messageType: 5,
  repeatIndicator: 0,
  mmsi: VALID_MMSI,
  aisVersion: 0,
  imo: VALID_IMO,
  callSign: '',
  vesselName: '',
  shipType: 0,
  dimensions: null,
  epfdType: 0,
  eta: { month: null, day: null, hour: null, minute: null },
  draught: null,
  destination: '',
  dte: false,
};

const baseType18: ClassBPositionReport = {
  messageType: 18,
  repeatIndicator: 0,
  mmsi: VALID_MMSI,
  speedOverGround: null,
  positionAccuracy: false,
  position: [14.5528, 53.4285],
  courseOverGround: null,
  trueHeading: null,
  timestamp: null,
  csUnit: false,
  displayFlag: false,
  dscFlag: false,
  bandFlag: false,
  message22Flag: false,
  assignedFlag: false,
  raim: false,
  radioStatus: 0,
};

describe('validateAisMessage', () => {
  it('accepts a valid PositionReport', () => {
    const result = validateAisMessage(baseType1);
    expect(result.ok).toBe(true);
  });

  it('rejects a PositionReport with sentinel-zero MMSI', () => {
    const result = validateAisMessage({ ...baseType1, mmsi: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-mmsi');
  });

  it('rejects a PositionReport with out-of-range latitude', () => {
    const result = validateAisMessage({ ...baseType1, position: [0, 91] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('out-of-range-lat');
  });

  it('rejects a PositionReport with out-of-range longitude', () => {
    const result = validateAisMessage({ ...baseType1, position: [181, 0] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('out-of-range-lng');
  });

  it('accepts a PositionReport with a null position (sentinel decoded)', () => {
    const result = validateAisMessage({ ...baseType1, position: null });
    expect(result.ok).toBe(true);
  });

  it('accepts a valid StaticData with a real IMO', () => {
    const result = validateAisMessage(baseType5);
    expect(result.ok).toBe(true);
  });

  it('accepts a StaticData with null IMO (sentinel decoded)', () => {
    const result = validateAisMessage({ ...baseType5, imo: null });
    expect(result.ok).toBe(true);
  });

  it('rejects a StaticData with an IMO whose check digit is wrong', () => {
    const result = validateAisMessage({ ...baseType5, imo: 9_074_720 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-imo');
  });

  it('rejects a StaticData with an out-of-range MMSI', () => {
    const result = validateAisMessage({ ...baseType5, mmsi: 100_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-mmsi');
  });

  it('accepts a valid ClassBPositionReport', () => {
    const result = validateAisMessage(baseType18);
    expect(result.ok).toBe(true);
  });

  it('rejects a ClassBPositionReport with bad coordinates', () => {
    const result = validateAisMessage({ ...baseType18, position: [-181, 0] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('out-of-range-lng');
  });

  it('returns unsupported-message-type for a future message type', () => {
    const fakeMessage = {
      ...baseType1,
      messageType: 99 as unknown as 1,
    };
    const result = validateAisMessage(fakeMessage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unsupported-message-type');
  });
});
