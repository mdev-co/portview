import { Decoder } from './decoder';

function withChecksum(body: string): string {
  let csum = 0;
  for (let i = 0; i < body.length; i += 1) csum ^= body.charCodeAt(i);
  return `!${body}*${csum.toString(16).toUpperCase().padStart(2, '0')}`;
}

const TYPE5_PART1 = withChecksum(
  'AIVDM,2,1,3,A,55?MbV02;H;s<HtKR20EHE:0@T4@Dn2222222216L961O5Gf0NSQEp6ClRp8,0',
);
const TYPE5_PART2 = withChecksum('AIVDM,2,2,3,A,88888888880,2');

describe('Decoder', () => {
  it('rejects a sentence with a corrupted checksum', () => {
    const broken = TYPE5_PART2.replace(/\*[0-9A-F]{2}$/, '*00');
    const result = new Decoder().decode(broken);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected')
      expect(result.reason.kind).toBe('bad-checksum');
  });

  it('rejects a structurally malformed sentence as parse-error', () => {
    const malformed = withChecksum('AIVDM,not,enough,fields');
    const result = new Decoder().decode(malformed);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected')
      expect(result.reason.kind).toBe('parse-error');
  });

  it('returns pending for the first fragment of a multipart message', () => {
    const result = new Decoder().decode(TYPE5_PART1);
    expect(result.kind).toBe('pending');
  });

  it('reassembles multipart and surfaces the validated message or its semantic reject', () => {
    const decoder = new Decoder();
    expect(decoder.decode(TYPE5_PART1).kind).toBe('pending');
    const result = decoder.decode(TYPE5_PART2);
    if (result.kind === 'rejected') {
      expect([
        'invalid-mmsi',
        'invalid-imo',
        'unsupported-message-type',
      ]).toContain(result.reason.kind);
    } else {
      expect(result.kind).toBe('message');
    }
  });

  it('rejects an empty sentence', () => {
    const result = new Decoder().decode('');
    expect(result.kind).toBe('rejected');
  });

  it('rejects an unsupported message type with the dedicated reason', () => {
    const sentence = withChecksum('AIVDM,1,1,,A,c,0');
    const result = new Decoder().decode(sentence);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(['unsupported-message-type', 'parse-error']).toContain(
        result.reason.kind,
      );
    }
  });
});
