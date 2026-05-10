import { describe, expect, it } from 'vitest';
import { CLASS_B_STATIC_PART_A, CLASS_B_STATIC_PART_B } from '../../types/class-b-static';
import {
  ClassBStaticTooShortError,
  NotClassBStaticError,
  decodeClassBStaticData,
} from '../ais-class-b-static';

const PART_A_BITS = 160;
const PART_B_BITS = 168;

type PartAFixture = {
  messageType?: number;
  repeatIndicator?: number;
  mmsi?: number;
  partNumber?: number;
  vesselNameChars?: readonly number[];
};

type PartBFixture = {
  messageType?: number;
  repeatIndicator?: number;
  mmsi?: number;
  partNumber?: number;
  shipType?: number;
  vendorIdChars?: readonly number[];
  callSignChars?: readonly number[];
  toBow?: number;
  toStern?: number;
  toPort?: number;
  toStarboard?: number;
  spareBits?: number;
};

function pushUInt(bits: number[], value: number, width: number): void {
  for (let i = width - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
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

/**
 * ITU-R M.1371-5 6-bit ASCII helper: 'A'-'Z' map to 1..26, space to
 * 32, digits '0'-'9' to 48-57, '@' to 0 (sentinel for empty char).
 */
function chars(input: string, length: number): readonly number[] {
  const padded = input.padEnd(length, '@');
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const code = padded.charCodeAt(i);
    if (code === 64)
      out.push(0); // '@' = sentinel for empty
    else if (code >= 65 && code <= 90) out.push(code - 64);
    else if (code === 32)
      out.push(32); // space
    else if (code >= 48 && code <= 57) out.push(code);
    else out.push(0);
  }
  return out;
}

function buildPartAPayload(fixture: PartAFixture = {}): string {
  const bits: number[] = [];
  pushUInt(bits, fixture.messageType ?? 24, 6);
  pushUInt(bits, fixture.repeatIndicator ?? 0, 2);
  pushUInt(bits, fixture.mmsi ?? 261_999_001, 30);
  pushUInt(bits, fixture.partNumber ?? 0, 2);
  const nameChars = fixture.vesselNameChars ?? chars('WIATR PD', 20);
  for (const c of nameChars) pushUInt(bits, c, 6);
  while (bits.length < PART_A_BITS) bits.push(0);
  return bitsToPayload(bits);
}

function buildPartBPayload(fixture: PartBFixture = {}): string {
  const bits: number[] = [];
  pushUInt(bits, fixture.messageType ?? 24, 6);
  pushUInt(bits, fixture.repeatIndicator ?? 0, 2);
  pushUInt(bits, fixture.mmsi ?? 261_999_001, 30);
  pushUInt(bits, fixture.partNumber ?? 1, 2);
  pushUInt(bits, fixture.shipType ?? 36, 8);
  const vendorChars = fixture.vendorIdChars ?? chars('GAR1234', 7);
  for (const c of vendorChars) pushUInt(bits, c, 6);
  const callSignChars = fixture.callSignChars ?? chars('SQABCDE', 7);
  for (const c of callSignChars) pushUInt(bits, c, 6);
  pushUInt(bits, fixture.toBow ?? 6, 9);
  pushUInt(bits, fixture.toStern ?? 3, 9);
  pushUInt(bits, fixture.toPort ?? 1, 6);
  pushUInt(bits, fixture.toStarboard ?? 1, 6);
  pushUInt(bits, fixture.spareBits ?? 0, 6);
  while (bits.length < PART_B_BITS) bits.push(0);
  return bitsToPayload(bits);
}

describe('decodeClassBStaticData PartA', () => {
  it('decodes message type, mmsi, partNumber and vesselName', () => {
    const payload = buildPartAPayload();
    const data = decodeClassBStaticData(payload);
    expect(data.messageType).toBe(24);
    expect(data.mmsi).toBe(261_999_001);
    expect(data.partNumber).toBe(CLASS_B_STATIC_PART_A);
    expect(data.vesselName.trim()).toBe('WIATR PD');
  });

  it('leaves PartB-specific fields at defaults when only PartA is decoded', () => {
    const data = decodeClassBStaticData(buildPartAPayload());
    expect(data.callSign).toBe('');
    expect(data.shipType).toBe(0);
    expect(data.dimensions).toBeNull();
    expect(data.vendorId).toBe('');
    expect(data.mothershipMmsi).toBeNull();
  });
});

describe('decodeClassBStaticData PartB', () => {
  it('decodes shipType, callSign, vendorId and dimensions', () => {
    const payload = buildPartBPayload();
    const data = decodeClassBStaticData(payload);
    expect(data.partNumber).toBe(CLASS_B_STATIC_PART_B);
    expect(data.shipType).toBe(36);
    expect(data.callSign.trim()).toBe('SQABCDE');
    expect(data.vendorId.trim()).toBe('GAR1234');
    expect(data.dimensions).toEqual({ toBow: 6, toStern: 3, toPort: 1, toStarboard: 1 });
  });

  it('leaves PartA-specific vesselName empty when only PartB is decoded', () => {
    const data = decodeClassBStaticData(buildPartBPayload());
    expect(data.vesselName).toBe('');
  });

  it('returns dimensions=null when all four offsets are zero', () => {
    const payload = buildPartBPayload({ toBow: 0, toStern: 0, toPort: 0, toStarboard: 0 });
    expect(decodeClassBStaticData(payload).dimensions).toBeNull();
  });
});

describe('decodeClassBStaticData rejections', () => {
  it('throws NotClassBStaticError when message type is not 24', () => {
    const payload = buildPartAPayload({ messageType: 18 });
    try {
      decodeClassBStaticData(payload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotClassBStaticError);
      expect((err as NotClassBStaticError).messageType).toBe(18);
    }
  });

  it('throws ClassBStaticTooShortError when payload is shorter than the header', () => {
    const payload = '15';
    try {
      decodeClassBStaticData(payload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClassBStaticTooShortError);
      expect((err as ClassBStaticTooShortError).bitLength).toBeLessThan(40);
    }
  });

  it('throws ClassBStaticTooShortError with partNumber when PartA is truncated', () => {
    // Build a header-only PartA frame: 40 bits of header + 0 bits payload
    const bits: number[] = [];
    pushUInt(bits, 24, 6);
    pushUInt(bits, 0, 2);
    pushUInt(bits, 261_999_001, 30);
    pushUInt(bits, 0, 2);
    const payload = bitsToPayload(bits);
    try {
      decodeClassBStaticData(payload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClassBStaticTooShortError);
      const e = err as ClassBStaticTooShortError;
      expect(e.partNumber).toBe(CLASS_B_STATIC_PART_A);
      expect(e.bitLength).toBeLessThan(PART_A_BITS);
    }
  });
});

describe('decodeClassBStaticData partNumber handling', () => {
  it('treats raw partNumber values 2 and 3 as PartA (default fallback)', () => {
    // Spec reserves 2-3; treating as PartA prevents undefined behavior.
    const payload = buildPartAPayload({ partNumber: 2 });
    expect(decodeClassBStaticData(payload).partNumber).toBe(CLASS_B_STATIC_PART_A);
  });
});
