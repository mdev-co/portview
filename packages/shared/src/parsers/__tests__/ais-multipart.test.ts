import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AisMultipartReassembler } from '../ais-multipart';
import type { AivdmEnvelope } from '../aivdm-envelope';

function envelope(overrides: Partial<AivdmEnvelope>): AivdmEnvelope {
  return {
    tag: 'AIVDM',
    fragments: 1,
    fragmentNum: 1,
    messageId: '',
    channel: 'A',
    payload: 'X',
    fillBits: 0,
    ...overrides,
  };
}

describe('AisMultipartReassembler', () => {
  it('passes single-fragment envelopes through immediately', () => {
    const r = new AisMultipartReassembler();
    const result = r.push(envelope({ payload: 'ABC' }));
    expect(result).toEqual({ payload: 'ABC', fillBits: 0, channel: 'A', messageId: '' });
    expect(r.bufferedCount()).toBe(0);
  });

  it('returns null on first fragment of a multi-fragment message', () => {
    const r = new AisMultipartReassembler();
    const result = r.push(
      envelope({ fragments: 2, fragmentNum: 1, messageId: '3', payload: 'AAA' }),
    );
    expect(result).toBeNull();
    expect(r.bufferedCount()).toBe(1);
  });

  it('emits assembled payload when all fragments arrive in order', () => {
    const r = new AisMultipartReassembler();
    expect(
      r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '3', payload: 'AAA' })),
    ).toBeNull();
    const result = r.push(
      envelope({ fragments: 2, fragmentNum: 2, messageId: '3', payload: 'BBB', fillBits: 2 }),
    );
    expect(result).toEqual({ payload: 'AAABBB', fillBits: 2, channel: 'A', messageId: '3' });
    expect(r.bufferedCount()).toBe(0);
  });

  it('handles fragments arriving out of order', () => {
    const r = new AisMultipartReassembler();
    expect(
      r.push(
        envelope({ fragments: 2, fragmentNum: 2, messageId: '7', payload: 'BBB', fillBits: 4 }),
      ),
    ).toBeNull();
    const result = r.push(
      envelope({ fragments: 2, fragmentNum: 1, messageId: '7', payload: 'AAA' }),
    );
    expect(result).toEqual({ payload: 'AAABBB', fillBits: 4, channel: 'A', messageId: '7' });
  });

  it('keeps distinct messageIds separate', () => {
    const r = new AisMultipartReassembler();
    expect(
      r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' })),
    ).toBeNull();
    expect(
      r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '2', payload: 'CCC' })),
    ).toBeNull();
    expect(r.bufferedCount()).toBe(2);
    expect(
      r.push(envelope({ fragments: 2, fragmentNum: 2, messageId: '1', payload: 'BBB' })),
    ).toEqual({ payload: 'AAABBB', fillBits: 0, channel: 'A', messageId: '1' });
    expect(r.bufferedCount()).toBe(1);
  });

  it('keeps distinct channels separate even with same messageId', () => {
    const r = new AisMultipartReassembler();
    expect(
      r.push(
        envelope({ fragments: 2, fragmentNum: 1, messageId: '1', channel: 'A', payload: 'AAA' }),
      ),
    ).toBeNull();
    expect(
      r.push(
        envelope({ fragments: 2, fragmentNum: 1, messageId: '1', channel: 'B', payload: 'CCC' }),
      ),
    ).toBeNull();
    expect(r.bufferedCount()).toBe(2);
  });

  it('ignores duplicate fragments', () => {
    const r = new AisMultipartReassembler();
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' }));
    const dup = r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'XXX' }));
    expect(dup).toBeNull();
    expect(
      r.push(envelope({ fragments: 2, fragmentNum: 2, messageId: '1', payload: 'BBB' })),
    ).toEqual({ payload: 'AAABBB', fillBits: 0, channel: 'A', messageId: '1' });
  });

  it('discards stale fragments after the configured TTL', () => {
    let now = 0;
    const r = new AisMultipartReassembler({ fragmentTtlMs: 1_000, now: () => now });
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' }));
    expect(r.bufferedCount()).toBe(1);
    now = 1_500;
    expect(r.pruneStale()).toBe(1);
    expect(r.bufferedCount()).toBe(0);
  });

  it('evicts oldest message when buffer is full', () => {
    let now = 0;
    const r = new AisMultipartReassembler({ maxBufferedMessages: 2, now: () => now });
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' }));
    now = 100;
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '2', payload: 'BBB' }));
    now = 200;
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '3', payload: 'CCC' }));
    expect(r.bufferedCount()).toBe(2);

    const msg2Done = r.push(
      envelope({ fragments: 2, fragmentNum: 2, messageId: '2', payload: 'BB2' }),
    );
    expect(msg2Done).toEqual({ payload: 'BBBBB2', fillBits: 0, channel: 'A', messageId: '2' });

    const msg3Done = r.push(
      envelope({ fragments: 2, fragmentNum: 2, messageId: '3', payload: 'CC3' }),
    );
    expect(msg3Done).toEqual({ payload: 'CCCCC3', fillBits: 0, channel: 'A', messageId: '3' });

    const lateMsg1 = r.push(
      envelope({ fragments: 2, fragmentNum: 2, messageId: '1', payload: 'A11' }),
    );
    expect(lateMsg1).toBeNull();
    expect(r.bufferedCount()).toBe(1);
  });

  it('replaces the buffered message with a fresh one if fragment count changes mid-flight', () => {
    const r = new AisMultipartReassembler();
    r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' }));
    expect(r.bufferedCount()).toBe(1);
    const result = r.push(
      envelope({ fragments: 3, fragmentNum: 1, messageId: '1', payload: 'XXX' }),
    );
    expect(result).toBeNull();
    expect(r.bufferedCount()).toBe(1);
    const finished = r.push(
      envelope({ fragments: 3, fragmentNum: 2, messageId: '1', payload: 'YYY' }),
    );
    expect(finished).toBeNull();
    const last = r.push(
      envelope({ fragments: 3, fragmentNum: 3, messageId: '1', payload: 'ZZZ', fillBits: 1 }),
    );
    expect(last).toEqual({ payload: 'XXXYYYZZZ', fillBits: 1, channel: 'A', messageId: '1' });
  });

  describe('default TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('uses Date.now when no clock is injected', () => {
      const r = new AisMultipartReassembler({ fragmentTtlMs: 100 });
      r.push(envelope({ fragments: 2, fragmentNum: 1, messageId: '1', payload: 'AAA' }));
      vi.advanceTimersByTime(150);
      expect(r.pruneStale()).toBe(1);
    });
  });
});
