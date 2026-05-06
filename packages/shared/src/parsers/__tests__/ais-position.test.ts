import { describe, expect, it } from 'vitest';
import {
  NotAPositionReportError,
  PositionReportTooShortError,
  decodePositionReport,
} from '../ais-position';

const CANONICAL_TYPE_1_PAYLOAD = '15M67FC000G?ufbE`Mg45oRP06hAA';

describe('decodePositionReport', () => {
  it('decodes the canonical type 1 reference payload', () => {
    const report = decodePositionReport(CANONICAL_TYPE_1_PAYLOAD);

    expect(report.messageType).toBe(1);
    expect(report.repeatIndicator).toBe(0);
    expect(report.mmsi).toBe(366053209);
    expect(report.navigationStatus).toBe(3);
    expect(report.rateOfTurn).toBe(0);
    expect(report.speedOverGround).toBe(0);
    expect(report.positionAccuracy).toBe(false);
    expect(report.position).not.toBeNull();
    const [lng, lat] = report.position!;
    expect(lng).toBeCloseTo(-122.341618, 4);
    expect(lat).toBeCloseTo(37.805113, 4);
    expect(report.courseOverGround).toBeCloseTo(104.7, 1);
    expect(report.trueHeading).toBe(241);
    expect(report.timestamp).toBe(16);
    expect(report.maneuverIndicator).toBe(0);
    expect(report.raim).toBe(false);
  });

  it('throws PositionReportTooShortError on short payloads', () => {
    expect(() => decodePositionReport('1')).toThrow(PositionReportTooShortError);
  });

  it('throws NotAPositionReportError on non-position message types', () => {
    const type5Prefix = '5'.padEnd(28, '0');
    expect(() => decodePositionReport(type5Prefix)).toThrow(NotAPositionReportError);
  });

  it('returns null for sentinel coordinates (lon 181, lat 91)', () => {
    const lonBits = (181 * 600_000).toString(2).padStart(28, '0');
    const latBits = (91 * 600_000).toString(2).padStart(27, '0');
    const tail = '0'.repeat(52);
    const bits = `000001${'0'.repeat(2)}${'0'.repeat(30)}${'0'.repeat(4)}${'0'.repeat(8)}${'0'.repeat(10)}${'0'}${lonBits}${latBits}${tail}`;
    expect(bits.length).toBe(168);
    const payload = bitsStringToPayload(bits);
    const report = decodePositionReport(payload);
    expect(report.position).toBeNull();
  });

  it('returns null for unavailable speed sentinel (1023)', () => {
    const sogBits = (1023).toString(2).padStart(10, '0');
    const bits = `000001${'0'.repeat(2)}${'0'.repeat(30)}${'0'.repeat(4)}${'0'.repeat(8)}${sogBits}${'0'.repeat(108)}`;
    expect(bits.length).toBe(168);
    const payload = bitsStringToPayload(bits);
    const report = decodePositionReport(payload);
    expect(report.speedOverGround).toBeNull();
  });

  it('returns null for unavailable heading sentinel (511)', () => {
    const headingBits = (511).toString(2).padStart(9, '0');
    const bits = `000001${'0'.repeat(2)}${'0'.repeat(30)}${'0'.repeat(4)}${'0'.repeat(8)}${'0'.repeat(10)}${'0'}${'0'.repeat(28)}${'0'.repeat(27)}${'0'.repeat(12)}${headingBits}${'0'.repeat(31)}`;
    expect(bits.length).toBe(168);
    const payload = bitsStringToPayload(bits);
    const report = decodePositionReport(payload);
    expect(report.trueHeading).toBeNull();
  });

  it('returns null for timestamp >= 60', () => {
    const timestampBits = (62).toString(2).padStart(6, '0');
    const bits = `000001${'0'.repeat(2)}${'0'.repeat(30)}${'0'.repeat(4)}${'0'.repeat(8)}${'0'.repeat(10)}${'0'}${'0'.repeat(28)}${'0'.repeat(27)}${'0'.repeat(12)}${'0'.repeat(9)}${timestampBits}${'0'.repeat(25)}`;
    expect(bits.length).toBe(168);
    const payload = bitsStringToPayload(bits);
    const report = decodePositionReport(payload);
    expect(report.timestamp).toBeNull();
  });

  it('returns null for unavailable rate-of-turn sentinel (-128)', () => {
    const rotBits = '10000000';
    const bits = `000001${'0'.repeat(2)}${'0'.repeat(30)}${'0'.repeat(4)}${rotBits}${'0'.repeat(118)}`;
    expect(bits.length).toBe(168);
    const payload = bitsStringToPayload(bits);
    const report = decodePositionReport(payload);
    expect(report.rateOfTurn).toBeNull();
  });
});

function bitsStringToPayload(bitsStr: string): string {
  if (bitsStr.length % 6 !== 0) {
    throw new Error(`bitsStringToPayload requires multiple of 6 bits, got ${bitsStr.length}`);
  }
  let result = '';
  for (let i = 0; i < bitsStr.length; i += 6) {
    const sixbit = parseInt(bitsStr.slice(i, i + 6), 2);
    const charCode = sixbit < 40 ? sixbit + 48 : sixbit + 56;
    result += String.fromCharCode(charCode);
  }
  return result;
}
