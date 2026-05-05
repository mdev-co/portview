import { describe, expect, it } from 'vitest';
import { isValidNmea, validateNmeaChecksum } from '../nmea-checksum';

function computeChecksum(payload: string): string {
  let xor = 0;
  for (let i = 0; i < payload.length; i += 1) {
    xor ^= payload.charCodeAt(i);
  }
  return xor.toString(16).toUpperCase().padStart(2, '0');
}

function makeSentence(start: '$' | '!', payload: string, checksum?: string): string {
  return `${start}${payload}*${checksum ?? computeChecksum(payload)}`;
}

describe('validateNmeaChecksum', () => {
  it('accepts a valid AIVDM sentence', () => {
    const sentence = makeSentence('!', 'AIVDM,1,1,,A,13aHFI001P,0');
    expect(validateNmeaChecksum(sentence)).toEqual({ valid: true });
  });

  it('accepts a valid GPGGA sentence', () => {
    const sentence = makeSentence(
      '$',
      'GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,',
    );
    expect(validateNmeaChecksum(sentence)).toEqual({ valid: true });
  });

  it('accepts a minimal valid sentence', () => {
    expect(validateNmeaChecksum(makeSentence('$', 'AB'))).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    expect(validateNmeaChecksum('')).toEqual({
      valid: false,
      reason: 'no-start-delimiter',
    });
  });

  it('rejects a sentence without a start delimiter', () => {
    expect(validateNmeaChecksum('AIVDM,1,1*44')).toEqual({
      valid: false,
      reason: 'no-start-delimiter',
    });
  });

  it('rejects a sentence without a checksum marker', () => {
    expect(validateNmeaChecksum('!AIVDM,1,1,,A,13aHFI001P,0')).toEqual({
      valid: false,
      reason: 'no-checksum-marker',
    });
  });

  it('rejects a malformed checksum (one digit)', () => {
    expect(validateNmeaChecksum('$AB*4')).toEqual({
      valid: false,
      reason: 'malformed-checksum',
    });
  });

  it('rejects a malformed checksum (non-hex)', () => {
    expect(validateNmeaChecksum('$AB*ZZ')).toEqual({
      valid: false,
      reason: 'malformed-checksum',
    });
  });

  it('rejects a sentence with a checksum mismatch', () => {
    const sentence = makeSentence('$', 'AB', '00');
    expect(validateNmeaChecksum(sentence)).toEqual({
      valid: false,
      reason: 'mismatch',
    });
  });

  it('handles checksums with lowercase hex letters', () => {
    const payload = 'GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W';
    const checksum = computeChecksum(payload).toLowerCase();
    expect(validateNmeaChecksum(`$${payload}*${checksum}`)).toEqual({ valid: true });
  });
});

describe('isValidNmea', () => {
  it('returns true for a valid sentence', () => {
    expect(isValidNmea(makeSentence('$', 'AB'))).toBe(true);
  });

  it('returns false for an invalid sentence', () => {
    expect(isValidNmea('not nmea')).toBe(false);
  });
});
