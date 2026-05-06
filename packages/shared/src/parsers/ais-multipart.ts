import type { AivdmEnvelope } from './aivdm-envelope';

export type AssembledPayload = Pick<
  AivdmEnvelope,
  'payload' | 'fillBits' | 'channel' | 'messageId'
>;

export type AisMultipartReassemblerOptions = {
  readonly maxBufferedMessages?: number;
  readonly fragmentTtlMs?: number;
  readonly now?: () => number;
};

type BufferedMessage = {
  readonly fragments: number;
  readonly channel: string;
  readonly messageId: string;
  readonly slots: (string | undefined)[];
  fillBits: number;
  filled: number;
  receivedAt: number;
};

const DEFAULT_MAX_BUFFERED = 100;
const DEFAULT_TTL_MS = 5_000;
const BUFFER_KEY_SEPARATOR = '|';

export class AisMultipartReassembler {
  private readonly maxBuffered: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly buffer = new Map<string, BufferedMessage>();

  constructor(options: AisMultipartReassemblerOptions = {}) {
    this.maxBuffered = options.maxBufferedMessages ?? DEFAULT_MAX_BUFFERED;
    this.ttlMs = options.fragmentTtlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  push(envelope: AivdmEnvelope): AssembledPayload | null {
    if (envelope.fragments === 1) {
      return {
        payload: envelope.payload,
        fillBits: envelope.fillBits,
        channel: envelope.channel,
        messageId: envelope.messageId,
      };
    }

    this.pruneStale();

    const key = this.bufferKey(envelope);
    let buffered = this.buffer.get(key);

    if (buffered && buffered.fragments !== envelope.fragments) {
      this.buffer.delete(key);
      buffered = undefined;
    }

    if (!buffered) {
      if (this.buffer.size >= this.maxBuffered) {
        const oldestKey = this.findOldestKey();
        if (oldestKey !== null) this.buffer.delete(oldestKey);
      }
      buffered = {
        fragments: envelope.fragments,
        channel: envelope.channel,
        messageId: envelope.messageId,
        slots: new Array<string | undefined>(envelope.fragments),
        fillBits: 0,
        filled: 0,
        receivedAt: this.now(),
      };
      this.buffer.set(key, buffered);
    }

    const slotIdx = envelope.fragmentNum - 1;
    if (buffered.slots[slotIdx] !== undefined) {
      return null;
    }
    buffered.slots[slotIdx] = envelope.payload;
    buffered.filled += 1;
    if (envelope.fragmentNum === envelope.fragments) {
      buffered.fillBits = envelope.fillBits;
    }

    if (buffered.filled === buffered.fragments) {
      this.buffer.delete(key);
      return {
        payload: buffered.slots.join(''),
        fillBits: buffered.fillBits,
        channel: buffered.channel,
        messageId: buffered.messageId,
      };
    }

    return null;
  }

  pruneStale(): number {
    const now = this.now();
    let pruned = 0;
    for (const [key, value] of this.buffer) {
      if (now - value.receivedAt > this.ttlMs) {
        this.buffer.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }

  bufferedCount(): number {
    return this.buffer.size;
  }

  private bufferKey(envelope: AivdmEnvelope): string {
    return `${envelope.channel}${BUFFER_KEY_SEPARATOR}${envelope.messageId}`;
  }

  private findOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, value] of this.buffer) {
      if (value.receivedAt < oldestAt) {
        oldestAt = value.receivedAt;
        oldestKey = key;
      }
    }
    return oldestKey;
  }
}
