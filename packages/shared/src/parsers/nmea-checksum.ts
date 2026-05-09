export interface ChecksumResult {
  readonly valid: boolean;
  readonly reason?: 'no-start-delimiter' | 'no-checksum-marker' | 'malformed-checksum' | 'mismatch';
}

const START_DELIMITERS = new Set(['$', '!']);

export function validateNmeaChecksum(sentence: string): ChecksumResult {
  if (sentence.length === 0 || !START_DELIMITERS.has(sentence[0]!)) {
    return { valid: false, reason: 'no-start-delimiter' };
  }

  const asteriskIndex = sentence.lastIndexOf('*');
  if (asteriskIndex < 1) {
    return { valid: false, reason: 'no-checksum-marker' };
  }

  const checksumHex = sentence.slice(asteriskIndex + 1, asteriskIndex + 3);
  if (checksumHex.length !== 2 || !/^[0-9A-Fa-f]{2}$/.test(checksumHex)) {
    return { valid: false, reason: 'malformed-checksum' };
  }

  const expected = parseInt(checksumHex, 16);
  let actual = 0;
  for (let i = 1; i < asteriskIndex; i += 1) {
    actual ^= sentence.charCodeAt(i);
  }
  actual &= 0xff;

  if (actual !== expected) {
    return { valid: false, reason: 'mismatch' };
  }
  return { valid: true };
}

export function isValidNmea(sentence: string): boolean {
  return validateNmeaChecksum(sentence).valid;
}
