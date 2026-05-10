import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AisMessage } from '../../types/ais-message';
import {
  ClassBPositionTooShortError,
  NotClassBPositionError,
  decodeClassBPositionReport,
} from '../ais-class-b-position';

const CLASS_B_POSITION_BITS = 168;
const COORD_SCALE = 600_000;

type ClassBFixture = {
  messageType?: number;
  repeatIndicator?: number;
  mmsi?: number;
  reserved1?: number;
  sogRaw?: number;
  positionAccuracyBit?: number;
  lonScaled?: number;
  latScaled?: number;
  cogRaw?: number;
  headingRaw?: number;
  timestampRaw?: number;
  reserved2?: number;
  csUnitBit?: number;
  displayFlagBit?: number;
  dscFlagBit?: number;
  bandFlagBit?: number;
  message22FlagBit?: number;
  assignedFlagBit?: number;
  raimBit?: number;
  radioStatus?: number;
};

function pushUInt(bits: number[], value: number, width: number): void {
  for (let i = width - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function pushInt(bits: number[], value: number, width: number): void {
  const unsigned = value < 0 ? value + 2 ** width : value;
  pushUInt(bits, unsigned, width);
}

function sixbitToArmoredChar(value: number): string {
  return String.fromCharCode(value < 40 ? 48 + value : 56 + value);
}

function bitsToPayload(bits: number[]): string {
  let result = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let b = 0; b < 6; b += 1) v = v * 2 + (bits[i + b] ?? 0);
    result += sixbitToArmoredChar(v);
  }
  return result;
}

function buildClassBPayload(fixture: ClassBFixture = {}): string {
  const bits: number[] = [];
  pushUInt(bits, fixture.messageType ?? 18, 6);
  pushUInt(bits, fixture.repeatIndicator ?? 0, 2);
  pushUInt(bits, fixture.mmsi ?? 244000001, 30);
  pushUInt(bits, fixture.reserved1 ?? 0, 8);
  pushUInt(bits, fixture.sogRaw ?? 78, 10);
  pushUInt(bits, fixture.positionAccuracyBit ?? 1, 1);
  pushInt(bits, fixture.lonScaled ?? Math.round(14.5 * COORD_SCALE), 28);
  pushInt(bits, fixture.latScaled ?? Math.round(53.4 * COORD_SCALE), 27);
  pushUInt(bits, fixture.cogRaw ?? 1234, 12);
  pushUInt(bits, fixture.headingRaw ?? 124, 9);
  pushUInt(bits, fixture.timestampRaw ?? 42, 6);
  pushUInt(bits, fixture.reserved2 ?? 0, 2);
  pushUInt(bits, fixture.csUnitBit ?? 1, 1);
  pushUInt(bits, fixture.displayFlagBit ?? 0, 1);
  pushUInt(bits, fixture.dscFlagBit ?? 1, 1);
  pushUInt(bits, fixture.bandFlagBit ?? 1, 1);
  pushUInt(bits, fixture.message22FlagBit ?? 1, 1);
  pushUInt(bits, fixture.assignedFlagBit ?? 0, 1);
  pushUInt(bits, fixture.raimBit ?? 0, 1);
  pushUInt(bits, fixture.radioStatus ?? 0xabcde, 20);
  while (bits.length < CLASS_B_POSITION_BITS) bits.push(0);
  return bitsToPayload(bits);
}

describe('decodeClassBPositionReport', () => {
  it('decodes a happy-path Class B position payload', () => {
    const payload = buildClassBPayload();
    const data = decodeClassBPositionReport(payload);
    expect(data.messageType).toBe(18);
    expect(data.mmsi).toBe(244000001);
    expect(data.speedOverGround).toBeCloseTo(7.8);
    expect(data.positionAccuracy).toBe(true);
    expect(data.position).not.toBeNull();
    if (data.position !== null) {
      expect(data.position[0]).toBeCloseTo(14.5);
      expect(data.position[1]).toBeCloseTo(53.4);
    }
    expect(data.courseOverGround).toBeCloseTo(123.4);
    expect(data.trueHeading).toBe(124);
    expect(data.timestamp).toBe(42);
    expect(data.csUnit).toBe(true);
    expect(data.displayFlag).toBe(false);
    expect(data.dscFlag).toBe(true);
    expect(data.bandFlag).toBe(true);
    expect(data.message22Flag).toBe(true);
    expect(data.assignedFlag).toBe(false);
    expect(data.raim).toBe(false);
    expect(data.radioStatus).toBe(0xabcde);
  });

  it('throws ClassBPositionTooShortError with bitLength attached', () => {
    const shortPayload = '15M67FC';
    try {
      decodeClassBPositionReport(shortPayload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClassBPositionTooShortError);
      expect((err as ClassBPositionTooShortError).bitLength).toBe(shortPayload.length * 6);
    }
  });

  it('throws NotClassBPositionError with the offending message type attached', () => {
    const payload = buildClassBPayload({ messageType: 1 });
    try {
      decodeClassBPositionReport(payload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotClassBPositionError);
      expect((err as NotClassBPositionError).messageType).toBe(1);
    }
  });

  it('returns speedOverGround null when raw is 1023 (unavailable)', () => {
    const payload = buildClassBPayload({ sogRaw: 1023 });
    expect(decodeClassBPositionReport(payload).speedOverGround).toBeNull();
  });

  it('returns position null when longitude raw is 181 degrees', () => {
    const payload = buildClassBPayload({ lonScaled: 181 * COORD_SCALE });
    expect(decodeClassBPositionReport(payload).position).toBeNull();
  });

  it('returns position null when latitude raw is 91 degrees', () => {
    const payload = buildClassBPayload({ latScaled: 91 * COORD_SCALE });
    expect(decodeClassBPositionReport(payload).position).toBeNull();
  });

  it('returns courseOverGround null when raw is 3600 (unavailable)', () => {
    const payload = buildClassBPayload({ cogRaw: 3600 });
    expect(decodeClassBPositionReport(payload).courseOverGround).toBeNull();
  });

  it('returns trueHeading null when raw is 511 (unavailable)', () => {
    const payload = buildClassBPayload({ headingRaw: 511 });
    expect(decodeClassBPositionReport(payload).trueHeading).toBeNull();
  });

  it('returns timestamp null when raw is 60 or above (unavailable)', () => {
    expect(
      decodeClassBPositionReport(buildClassBPayload({ timestampRaw: 60 })).timestamp,
    ).toBeNull();
    expect(
      decodeClassBPositionReport(buildClassBPayload({ timestampRaw: 63 })).timestamp,
    ).toBeNull();
  });

  it('decodes positionAccuracy false when bit is 0 (low / unaugmented GNSS)', () => {
    const payload = buildClassBPayload({ positionAccuracyBit: 0 });
    expect(decodeClassBPositionReport(payload).positionAccuracy).toBe(false);
  });

  it('decodes negative longitudes (two\u2019s complement)', () => {
    const lon = -10.25;
    const payload = buildClassBPayload({ lonScaled: Math.round(lon * COORD_SCALE) });
    const data = decodeClassBPositionReport(payload);
    expect(data.position).not.toBeNull();
    if (data.position !== null) expect(data.position[0]).toBeCloseTo(lon);
  });

  it('decodes negative latitudes (southern hemisphere)', () => {
    const lat = -34.6;
    const payload = buildClassBPayload({ latScaled: Math.round(lat * COORD_SCALE) });
    const data = decodeClassBPositionReport(payload);
    expect(data.position).not.toBeNull();
    if (data.position !== null) expect(data.position[1]).toBeCloseTo(lat);
  });

  it('decodes all flag bits independently', () => {
    const payload = buildClassBPayload({
      csUnitBit: 0,
      displayFlagBit: 1,
      dscFlagBit: 0,
      bandFlagBit: 0,
      message22FlagBit: 0,
      assignedFlagBit: 1,
      raimBit: 1,
    });
    const data = decodeClassBPositionReport(payload);
    expect(data.csUnit).toBe(false);
    expect(data.displayFlag).toBe(true);
    expect(data.dscFlag).toBe(false);
    expect(data.bandFlag).toBe(false);
    expect(data.message22Flag).toBe(false);
    expect(data.assignedFlag).toBe(true);
    expect(data.raim).toBe(true);
  });
});

describe('AisMessage discriminated union', () => {
  it('exhaustive switch on messageType compiles and dispatches correctly', () => {
    const classB = decodeClassBPositionReport(buildClassBPayload());
    const message: AisMessage = classB;

    const label = ((msg: AisMessage): string => {
      switch (msg.messageType) {
        case 1:
        case 2:
        case 3:
          return `position-class-a-${msg.mmsi}`;
        case 5:
          return `static-${msg.mmsi}`;
        case 18:
          return `position-class-b-${msg.mmsi}`;
        case 24:
          return `static-class-b-${msg.mmsi}`;
        default: {
          const exhaustive: never = msg;
          return exhaustive;
        }
      }
    })(message);

    expect(label).toBe(`position-class-b-${classB.mmsi}`);
    expectTypeOf<AisMessage['messageType']>().toEqualTypeOf<1 | 2 | 3 | 5 | 18 | 24>();
  });
});
