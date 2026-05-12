import { classifyMmsiRejection, isValidMmsi } from './mmsi-validator';

describe('isValidMmsi', () => {
  it('accepts a Polish MID (261)', () => {
    expect(isValidMmsi(261_000_001)).toBe(true);
    expect(isValidMmsi(261_999_999)).toBe(true);
  });

  it('accepts other assigned country MIDs in 201-775 range', () => {
    expect(isValidMmsi(201_111_111)).toBe(true);
    expect(isValidMmsi(775_111_111)).toBe(true);
  });

  it('accepts auxiliary prefixes (111 SAR, 970/972/974)', () => {
    expect(isValidMmsi(111_000_000)).toBe(true);
    expect(isValidMmsi(970_111_111)).toBe(true);
    expect(isValidMmsi(974_999_999)).toBe(true);
  });

  it('accepts reserved 99x range', () => {
    expect(isValidMmsi(990_000_000)).toBe(true);
    expect(isValidMmsi(999_999_999)).toBe(true);
  });

  it('rejects MMSI shorter than 9 digits', () => {
    expect(isValidMmsi(1)).toBe(false);
    expect(isValidMmsi(12_345_678)).toBe(false);
  });

  it('rejects MMSI longer than 9 digits', () => {
    expect(isValidMmsi(1_000_000_000)).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(isValidMmsi(261_000_001.5)).toBe(false);
    expect(isValidMmsi(Number.NaN)).toBe(false);
    expect(isValidMmsi(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects negative values', () => {
    expect(isValidMmsi(-261_000_001)).toBe(false);
  });

  it('rejects unknown MIDs between assigned and reserved ranges', () => {
    expect(isValidMmsi(776_000_000)).toBe(false);
    expect(isValidMmsi(800_000_000)).toBe(false);
    expect(isValidMmsi(969_000_000)).toBe(false);
  });

  it('rejects 200_xxx (just below assigned range)', () => {
    expect(isValidMmsi(200_111_111)).toBe(false);
  });
});

describe('classifyMmsiRejection', () => {
  it('classifies non-integer', () => {
    expect(classifyMmsiRejection(1.5)).toBe('mmsi-not-integer');
  });

  it('classifies out-of-range', () => {
    expect(classifyMmsiRejection(1)).toBe('mmsi-out-of-range');
    expect(classifyMmsiRejection(1_000_000_000)).toBe('mmsi-out-of-range');
  });

  it('classifies unknown MID', () => {
    expect(classifyMmsiRejection(800_000_000)).toBe('mmsi-unknown-mid');
  });
});
