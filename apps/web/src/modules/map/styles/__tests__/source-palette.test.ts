import { describe, expect, it } from 'vitest';
import { SourceId } from '@sps/shared';
import { SOURCE_PALETTE, UNKNOWN_SOURCE_PALETTE, paletteFor } from '../source-palette';

describe('paletteFor', () => {
  it('returns the matching palette entry for every known SourceId', () => {
    expect(paletteFor(SourceId.LocalUdp)).toBe(SOURCE_PALETTE[SourceId.LocalUdp]);
    expect(paletteFor(SourceId.WebSdr)).toBe(SOURCE_PALETTE[SourceId.WebSdr]);
    expect(paletteFor(SourceId.AisStream)).toBe(SOURCE_PALETTE[SourceId.AisStream]);
    expect(paletteFor(SourceId.EdgeBridge)).toBe(SOURCE_PALETTE[SourceId.EdgeBridge]);
  });

  it('returns UNKNOWN_SOURCE_PALETTE for null', () => {
    expect(paletteFor(null)).toBe(UNKNOWN_SOURCE_PALETTE);
  });

  it('returns UNKNOWN_SOURCE_PALETTE for undefined', () => {
    expect(paletteFor(undefined)).toBe(UNKNOWN_SOURCE_PALETTE);
  });

  it('returns UNKNOWN_SOURCE_PALETTE for an out-of-range integer (regression: SourceDot crash 2026-06-03)', () => {
    // Snapshot decoder casts the raw protobuf int to SourceId at the
    // type boundary; a legacy DB row or a future enum expansion can
    // surface a number outside the {0,1,2,3} domain. The previous
    // implementation returned undefined from SOURCE_PALETTE[...] and
    // SourceDot crashed on `.dotFilled`, taking the sidebar tree down
    // through the React error boundary. The fallback must be in place
    // at the adapter boundary, not at every consumer.
    const outOfRange = 99 as unknown as SourceId;
    expect(paletteFor(outOfRange)).toBe(UNKNOWN_SOURCE_PALETTE);
  });

  it('UNKNOWN_SOURCE_PALETTE exposes the full SourcePaletteEntry shape', () => {
    // Regression guard: a SourceDot consumer reads `.dotFilled`,
    // `.dotHex`, `.label`, `.description`. The fallback must answer all
    // of them without throwing.
    expect(UNKNOWN_SOURCE_PALETTE.dotFilled).toBeTypeOf('boolean');
    expect(UNKNOWN_SOURCE_PALETTE.dotHex).toBeTypeOf('string');
    expect(UNKNOWN_SOURCE_PALETTE.label).toBeTypeOf('string');
    expect(UNKNOWN_SOURCE_PALETTE.description).toBeTypeOf('string');
  });
});
