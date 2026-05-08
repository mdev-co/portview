import {
  type AisMessage,
  AisMultipartReassembler,
  type AivdmEnvelope,
  AivdmParseError,
  type AssembledPayload,
  BitReader,
  type RejectReason,
  decodeClassBPositionReport,
  decodePositionReport,
  decodeStaticData,
  parseAivdmEnvelope,
  payloadToBits,
  validateAisMessage,
  validateNmeaChecksum,
} from '@sps/shared';

const MIN_PAYLOAD_BITS = 6;

/**
 * Reason a frame did not produce a validated message. Distinct from
 * `RejectReason` (semantic invariant violations) by the wrapper variants
 * that capture transport-layer failures.
 */
export type DecodeRejection =
  | { readonly kind: 'bad-checksum'; readonly detail: string }
  | { readonly kind: 'parse-error'; readonly detail: string }
  | { readonly kind: 'unsupported-message-type'; readonly messageType: number }
  | RejectReason;

/**
 * Outcome of a single frame passing through the decoder. `pending`
 * means the frame contributed to a multipart message that is not yet
 * complete; the caller should not treat it as accepted nor rejected.
 */
export type DecodeOutcome =
  | { readonly kind: 'message'; readonly value: AisMessage }
  | { readonly kind: 'pending' }
  | { readonly kind: 'rejected'; readonly reason: DecodeRejection };

export type DecoderOptions = {
  readonly reassembler?: AisMultipartReassembler;
};

/**
 * GIGO boundary for the AIS ingest pipeline.
 *
 * Every accepted frame goes through:
 *   1. NMEA checksum verification.
 *   2. AIVDM envelope parsing (structural).
 *   3. Multipart reassembly (single-fragment frames pass through; multi-
 *      fragment frames are buffered until complete).
 *   4. Bit-level decode dispatched by message type.
 *   5. Semantic validation against AIS-198 invariants
 *      (`validateAisMessage`).
 *
 * Output is a typed Result. Pending state is distinct from rejection so
 * the pipeline can avoid logging a DLQ entry for fragments that are
 * still in flight.
 */
export class Decoder {
  private readonly reassembler: AisMultipartReassembler;

  constructor(options: DecoderOptions = {}) {
    this.reassembler = options.reassembler ?? new AisMultipartReassembler();
  }

  decode(raw: string): DecodeOutcome {
    const checksum = validateNmeaChecksum(raw);
    if (!checksum.valid) {
      return {
        kind: 'rejected',
        reason: { kind: 'bad-checksum', detail: checksum.reason ?? 'unknown' },
      };
    }

    let envelope: AivdmEnvelope;
    try {
      envelope = parseAivdmEnvelope(raw);
    } catch (err) {
      const detail = err instanceof AivdmParseError ? err.message : String(err);
      return { kind: 'rejected', reason: { kind: 'parse-error', detail } };
    }

    const assembled = this.reassembler.push(envelope);
    if (assembled === null) {
      return { kind: 'pending' };
    }

    return this.decodeAssembled(assembled);
  }

  private decodeAssembled(assembled: AssembledPayload): DecodeOutcome {
    let messageType: number;
    try {
      const bits = payloadToBits(assembled.payload);
      if (bits.length < MIN_PAYLOAD_BITS) {
        return {
          kind: 'rejected',
          reason: { kind: 'parse-error', detail: 'payload shorter than 6 bits' },
        };
      }
      messageType = new BitReader(bits).readUInt(MIN_PAYLOAD_BITS);
    } catch (err) {
      return { kind: 'rejected', reason: { kind: 'parse-error', detail: String(err) } };
    }

    let message: AisMessage;
    try {
      switch (messageType) {
        case 1:
        case 2:
        case 3:
          message = decodePositionReport(assembled.payload);
          break;
        case 5:
          message = decodeStaticData(assembled.payload);
          break;
        case 18:
          message = decodeClassBPositionReport(assembled.payload);
          break;
        default:
          return {
            kind: 'rejected',
            reason: { kind: 'unsupported-message-type', messageType },
          };
      }
    } catch (err) {
      return { kind: 'rejected', reason: { kind: 'parse-error', detail: String(err) } };
    }

    const validation = validateAisMessage(message);
    if (!validation.ok) {
      return { kind: 'rejected', reason: validation.error };
    }
    return { kind: 'message', value: validation.value };
  }
}
