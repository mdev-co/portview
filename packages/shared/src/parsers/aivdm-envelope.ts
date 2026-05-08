/**
 * Structural parser for an AIVDM/AIVDO sentence (the NMEA wrapper that
 * carries an AIS payload). Validates field count and fill-bit range,
 * extracts envelope fields; no bit-level decode happens here — that
 * belongs to the message-type-specific parsers downstream.
 */
const AIVDM_FIELD_COUNT = 7;
const MIN_FRAGMENT = 1;
const MAX_FILL_BITS = 5;

export type AivdmEnvelope = {
  readonly tag: 'AIVDM' | 'AIVDO';
  readonly fragments: number;
  readonly fragmentNum: number;
  readonly messageId: string;
  readonly channel: string;
  readonly payload: string;
  readonly fillBits: number;
};

export class AivdmParseError extends Error {
  readonly sentence: string;

  constructor(sentence: string, reason: string) {
    super(`AIVDM parse failed: ${reason} (sentence: "${sentence}")`);
    this.sentence = sentence;
    this.name = 'AivdmParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseAivdmEnvelope(sentence: string): AivdmEnvelope {
  const trimmed = sentence.trim();
  if (trimmed.length === 0) {
    throw new AivdmParseError(sentence, 'empty sentence');
  }
  if (trimmed[0] !== '!') {
    throw new AivdmParseError(sentence, 'missing start delimiter');
  }

  const checksumIdx = trimmed.lastIndexOf('*');
  if (checksumIdx < 1) {
    throw new AivdmParseError(sentence, 'missing checksum marker');
  }

  const body = trimmed.slice(1, checksumIdx);
  const fields = body.split(',');
  if (fields.length !== AIVDM_FIELD_COUNT) {
    throw new AivdmParseError(
      sentence,
      `expected ${AIVDM_FIELD_COUNT} fields, got ${fields.length}`,
    );
  }

  const [tag, fragmentsStr, fragmentNumStr, messageId, channel, payload, fillBitsStr] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (tag !== 'AIVDM' && tag !== 'AIVDO') {
    throw new AivdmParseError(sentence, `unsupported tag "${tag}"`);
  }

  const fragments = Number.parseInt(fragmentsStr, 10);
  const fragmentNum = Number.parseInt(fragmentNumStr, 10);
  const fillBits = Number.parseInt(fillBitsStr, 10);

  if (!Number.isInteger(fragments) || fragments < MIN_FRAGMENT) {
    throw new AivdmParseError(sentence, `invalid fragments count "${fragmentsStr}"`);
  }
  if (!Number.isInteger(fragmentNum) || fragmentNum < MIN_FRAGMENT || fragmentNum > fragments) {
    throw new AivdmParseError(sentence, `invalid fragment number "${fragmentNumStr}"`);
  }
  if (!Number.isInteger(fillBits) || fillBits < 0 || fillBits > MAX_FILL_BITS) {
    throw new AivdmParseError(sentence, `invalid fill bits "${fillBitsStr}"`);
  }

  return {
    tag,
    fragments,
    fragmentNum,
    messageId,
    channel,
    payload,
    fillBits,
  };
}
