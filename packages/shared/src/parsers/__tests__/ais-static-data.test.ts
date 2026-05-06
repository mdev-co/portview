import { describe, expect, it } from 'vitest';
import { AisMultipartReassembler } from '../ais-multipart';
import { NotStaticDataError, StaticDataTooShortError, decodeStaticData } from '../ais-static-data';
import { parseAivdmEnvelope } from '../aivdm-envelope';

const STATIC_DATA_BITS = 424;
const CALL_SIGN_CHARS = 7;
const VESSEL_NAME_CHARS = 20;
const DESTINATION_CHARS = 20;

type StaticDataFixture = {
  messageType?: number;
  repeatIndicator?: number;
  mmsi?: number;
  aisVersion?: number;
  imo?: number;
  callSign?: string;
  vesselName?: string;
  shipType?: number;
  toBow?: number;
  toStern?: number;
  toPort?: number;
  toStarboard?: number;
  epfdType?: number;
  etaMonth?: number;
  etaDay?: number;
  etaHour?: number;
  etaMinute?: number;
  draughtRaw?: number;
  destination?: string;
  dteBit?: number;
};

const ASCII_TO_SIXBIT: Record<number, number> = (() => {
  const map: Record<number, number> = { 64: 0 };
  for (let c = 65; c <= 95; c += 1) map[c] = c - 64;
  map[32] = 32;
  for (let c = 33; c <= 63; c += 1) map[c] = c;
  return map;
})();

function pushUInt(bits: number[], value: number, width: number): void {
  for (let i = width - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function pushString(bits: number[], str: string, charCount: number): void {
  for (let i = 0; i < charCount; i += 1) {
    const code = i < str.length ? str.charCodeAt(i) : 64;
    const six = ASCII_TO_SIXBIT[code] ?? 0;
    pushUInt(bits, six, 6);
  }
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

function buildStaticDataPayload(fixture: StaticDataFixture = {}): string {
  const bits: number[] = [];
  pushUInt(bits, fixture.messageType ?? 5, 6);
  pushUInt(bits, fixture.repeatIndicator ?? 0, 2);
  pushUInt(bits, fixture.mmsi ?? 261000000, 30);
  pushUInt(bits, fixture.aisVersion ?? 1, 2);
  pushUInt(bits, fixture.imo ?? 9000001, 30);
  pushString(bits, fixture.callSign ?? 'SPNX', CALL_SIGN_CHARS);
  pushString(bits, fixture.vesselName ?? 'POLARIS', VESSEL_NAME_CHARS);
  pushUInt(bits, fixture.shipType ?? 70, 8);
  pushUInt(bits, fixture.toBow ?? 80, 9);
  pushUInt(bits, fixture.toStern ?? 20, 9);
  pushUInt(bits, fixture.toPort ?? 8, 6);
  pushUInt(bits, fixture.toStarboard ?? 8, 6);
  pushUInt(bits, fixture.epfdType ?? 1, 4);
  pushUInt(bits, fixture.etaMonth ?? 6, 4);
  pushUInt(bits, fixture.etaDay ?? 15, 5);
  pushUInt(bits, fixture.etaHour ?? 14, 5);
  pushUInt(bits, fixture.etaMinute ?? 30, 6);
  pushUInt(bits, fixture.draughtRaw ?? 75, 8);
  pushString(bits, fixture.destination ?? 'SZCZECIN', DESTINATION_CHARS);
  pushUInt(bits, fixture.dteBit ?? 0, 1);
  pushUInt(bits, 0, 1);
  while (bits.length < STATIC_DATA_BITS) bits.push(0);
  return bitsToPayload(bits);
}

describe('decodeStaticData', () => {
  it('decodes a happy-path static data payload', () => {
    const payload = buildStaticDataPayload();
    const data = decodeStaticData(payload);
    expect(data.messageType).toBe(5);
    expect(data.mmsi).toBe(261000000);
    expect(data.aisVersion).toBe(1);
    expect(data.imo).toBe(9000001);
    expect(data.callSign).toBe('SPNX');
    expect(data.vesselName).toBe('POLARIS');
    expect(data.shipType).toBe(70);
    expect(data.dimensions).toEqual({ toBow: 80, toStern: 20, toPort: 8, toStarboard: 8 });
    expect(data.epfdType).toBe(1);
    expect(data.eta).toEqual({ month: 6, day: 15, hour: 14, minute: 30 });
    expect(data.draught).toBe(7.5);
    expect(data.destination).toBe('SZCZECIN');
    expect(data.dte).toBe(true);
  });

  it('throws StaticDataTooShortError on a payload below 424 bits with the bit length attached', () => {
    const shortPayload = '15M67FC000G';
    try {
      decodeStaticData(shortPayload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(StaticDataTooShortError);
      expect((err as StaticDataTooShortError).bitLength).toBe(shortPayload.length * 6);
    }
  });

  it('throws NotStaticDataError with the offending message type attached', () => {
    const payload = buildStaticDataPayload({ messageType: 1 });
    try {
      decodeStaticData(payload);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotStaticDataError);
      expect((err as NotStaticDataError).messageType).toBe(1);
    }
  });

  it('returns imo null when raw value is 0 (Class B vessel without IMO)', () => {
    const payload = buildStaticDataPayload({ imo: 0 });
    expect(decodeStaticData(payload).imo).toBeNull();
  });

  it('returns dimensions null when toBow + toStern == 0', () => {
    const payload = buildStaticDataPayload({ toBow: 0, toStern: 0, toPort: 0, toStarboard: 0 });
    expect(decodeStaticData(payload).dimensions).toBeNull();
  });

  it('keeps dimensions when at least one of toBow / toStern is non-zero', () => {
    const payload = buildStaticDataPayload({ toBow: 30, toStern: 0, toPort: 5, toStarboard: 5 });
    expect(decodeStaticData(payload).dimensions).toEqual({
      toBow: 30,
      toStern: 0,
      toPort: 5,
      toStarboard: 5,
    });
  });

  it('returns draught null when raw value is 0 (unknown)', () => {
    const payload = buildStaticDataPayload({ draughtRaw: 0 });
    expect(decodeStaticData(payload).draught).toBeNull();
  });

  it('returns draught in metres scaled by 1/10', () => {
    const payload = buildStaticDataPayload({ draughtRaw: 123 });
    expect(decodeStaticData(payload).draught).toBeCloseTo(12.3);
  });

  it('returns eta.month null when raw is 0 or > 12', () => {
    expect(decodeStaticData(buildStaticDataPayload({ etaMonth: 0 })).eta.month).toBeNull();
    expect(decodeStaticData(buildStaticDataPayload({ etaMonth: 15 })).eta.month).toBeNull();
  });

  it('returns eta.day null when raw is 0 and accepts the boundary value 31', () => {
    expect(decodeStaticData(buildStaticDataPayload({ etaDay: 0 })).eta.day).toBeNull();
    expect(decodeStaticData(buildStaticDataPayload({ etaDay: 31 })).eta.day).toBe(31);
  });

  it('returns eta.hour null when raw is 24', () => {
    expect(decodeStaticData(buildStaticDataPayload({ etaHour: 24 })).eta.hour).toBeNull();
  });

  it('returns eta.minute null when raw is 60', () => {
    expect(decodeStaticData(buildStaticDataPayload({ etaMinute: 60 })).eta.minute).toBeNull();
  });

  it('strips trailing @ padding from vesselName, callSign, destination', () => {
    const payload = buildStaticDataPayload({
      vesselName: 'KING',
      callSign: 'A1',
      destination: 'GDA',
    });
    const data = decodeStaticData(payload);
    expect(data.vesselName).toBe('KING');
    expect(data.callSign).toBe('A1');
    expect(data.destination).toBe('GDA');
  });

  it('preserves vesselName when it fully fills 20 chars (no padding to trim)', () => {
    const fullName = 'ABCDEFGHIJKLMNOPQRST';
    const payload = buildStaticDataPayload({ vesselName: fullName });
    expect(decodeStaticData(payload).vesselName).toBe(fullName);
  });

  it('decodes dte true when bit is 0 (Data Terminal Ready)', () => {
    expect(decodeStaticData(buildStaticDataPayload({ dteBit: 0 })).dte).toBe(true);
  });

  it('decodes dte false when bit is 1 (DTE not ready)', () => {
    expect(decodeStaticData(buildStaticDataPayload({ dteBit: 1 })).dte).toBe(false);
  });

  describe('end-to-end pipeline (envelope -> reassembler -> decoder)', () => {
    it('reassembles two AIVDM fragments and decodes into StaticData', () => {
      const fullPayload = buildStaticDataPayload({
        mmsi: 211000001,
        imo: 9123456,
        callSign: 'DABCD',
        vesselName: 'NORDLICHT',
        shipType: 80,
        toBow: 100,
        toStern: 50,
        toPort: 10,
        toStarboard: 10,
        etaMonth: 7,
        etaDay: 4,
        etaHour: 12,
        etaMinute: 0,
        draughtRaw: 95,
        destination: 'HAMBURG',
      });

      const splitAt = Math.ceil(fullPayload.length / 2);
      const part1 = fullPayload.slice(0, splitAt);
      const part2 = fullPayload.slice(splitAt);
      const trailingPadBits = fullPayload.length * 6 - STATIC_DATA_BITS;

      const sentence1 = `!AIVDM,2,1,7,A,${part1},0*00`;
      const sentence2 = `!AIVDM,2,2,7,A,${part2},${trailingPadBits}*00`;

      const reassembler = new AisMultipartReassembler();
      const env1 = parseAivdmEnvelope(sentence1);
      const env2 = parseAivdmEnvelope(sentence2);

      expect(reassembler.push(env1)).toBeNull();
      const assembled = reassembler.push(env2);
      expect(assembled).not.toBeNull();
      if (assembled === null) throw new Error('unreachable');

      const data = decodeStaticData(assembled.payload);
      expect(data.mmsi).toBe(211000001);
      expect(data.imo).toBe(9123456);
      expect(data.callSign).toBe('DABCD');
      expect(data.vesselName).toBe('NORDLICHT');
      expect(data.shipType).toBe(80);
      expect(data.dimensions).toEqual({ toBow: 100, toStern: 50, toPort: 10, toStarboard: 10 });
      expect(data.eta).toEqual({ month: 7, day: 4, hour: 12, minute: 0 });
      expect(data.draught).toBeCloseTo(9.5);
      expect(data.destination).toBe('HAMBURG');
    });
  });
});
