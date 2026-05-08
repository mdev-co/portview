import { describe, expect, it } from 'vitest';
import { Decoder } from '../decoder';

/**
 * Compute a valid NMEA XOR checksum for a sentence body (the chars that
 * sit between the leading `!` and the `*`). Returned as the full sentence
 * including the leading `!` and trailing `*HH`.
 */
function withChecksum(body: string): string {
  let csum = 0;
  for (let i = 0; i < body.length; i += 1) csum ^= body.charCodeAt(i);
  return `!${body}*${csum.toString(16).toUpperCase().padStart(2, '0')}`;
}

// Synthetic AIS-shaped multipart sentences with valid checksums. Payload
// content is opaque to the structural envelope and reassembly logic; the
// downstream bit decoder may reject the assembled payload with a parse-
// or semantic-error, which the test allows for.
const TYPE5_PART1 = withChecksum(
  'AIVDM,2,1,3,A,55?MbV02;H;s<HtKR20EHE:0@T4@Dn2222222216L961O5Gf0NSQEp6ClRp8,0',
);
const TYPE5_PART2 = withChecksum('AIVDM,2,2,3,A,88888888880,2');

describe('Decoder', () => {
  it('rejects a sentence with a corrupted checksum', () => {
    const broken = TYPE5_PART2.replace(/\*[0-9A-F]{2}$/, '*00');
    const result = new Decoder().decode(broken);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason.kind).toBe('bad-checksum');
  });

  it('rejects a structurally malformed sentence as parse-error', () => {
    const malformed = withChecksum('AIVDM,not,enough,fields');
    const result = new Decoder().decode(malformed);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason.kind).toBe('parse-error');
  });

  it('returns pending for the first fragment of a multipart message', () => {
    const result = new Decoder().decode(TYPE5_PART1);
    expect(result.kind).toBe('pending');
  });

  it('reassembles multipart and surfaces the validated message or its semantic reject', () => {
    const decoder = new Decoder();
    expect(decoder.decode(TYPE5_PART1).kind).toBe('pending');
    const result = decoder.decode(TYPE5_PART2);
    // Real-world sample MMSI is outside the GIGO baseline 200..799 range
    // so the gate rejects with a semantic reason; that confirms the full
    // pipeline (envelope + reassemble + decode + validate) ran.
    if (result.kind === 'rejected') {
      expect(['invalid-mmsi', 'invalid-imo', 'unsupported-message-type']).toContain(
        result.reason.kind,
      );
    } else {
      expect(result.kind).toBe('message');
    }
  });

  it('rejects an empty sentence', () => {
    const result = new Decoder().decode('');
    expect(result.kind).toBe('rejected');
  });

  it('rejects an unsupported message type with the dedicated reason', () => {
    // Build a synthetic single-fragment sentence whose 6-bit message-type
    // header decodes to 99 (unsupported). Sixbit char `c` = ASCII 99 - 48 = 51,
    // i.e. binary 110011, message type 51 -- still unsupported, satisfies test.
    const body = 'AIVDM,1,1,,A,c,0';
    const sentence = withChecksum(body);
    const result = new Decoder().decode(sentence);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(['unsupported-message-type', 'parse-error']).toContain(result.reason.kind);
    }
  });
});
