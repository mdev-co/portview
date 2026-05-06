import { describe, expect, it } from 'vitest';
import { BitReader, aisCharFromBits, payloadToBits, sixbitFromChar } from '../ais-bits';

describe('sixbitFromChar', () => {
  it('decodes the lower range 48-87 to 0-39', () => {
    expect(sixbitFromChar('0'.charCodeAt(0))).toBe(0);
    expect(sixbitFromChar('9'.charCodeAt(0))).toBe(9);
    expect(sixbitFromChar('A'.charCodeAt(0))).toBe(17);
    expect(sixbitFromChar('W'.charCodeAt(0))).toBe(39);
  });

  it('decodes the upper range 96-119 to 40-63', () => {
    expect(sixbitFromChar('`'.charCodeAt(0))).toBe(40);
    expect(sixbitFromChar('w'.charCodeAt(0))).toBe(63);
  });

  it('throws on characters outside the sixbit ranges', () => {
    expect(() => sixbitFromChar(' '.charCodeAt(0))).toThrow(/Invalid AIS sixbit/);
    expect(() => sixbitFromChar('x'.charCodeAt(0))).toThrow(/Invalid AIS sixbit/);
    expect(() => sixbitFromChar('!'.charCodeAt(0))).toThrow(/Invalid AIS sixbit/);
  });
});

describe('payloadToBits', () => {
  it('produces 6 bits per character', () => {
    expect(payloadToBits('0').length).toBe(6);
    expect(payloadToBits('00').length).toBe(12);
    expect(payloadToBits('123ABC').length).toBe(36);
  });

  it("packs '1' (sixbit 1, 000001) into the right bit pattern", () => {
    const bits = payloadToBits('1');
    expect(Array.from(bits)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("packs 'w' (sixbit 63, 111111) as all ones", () => {
    const bits = payloadToBits('w');
    expect(Array.from(bits)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('packs a multi-char payload sequentially', () => {
    const bits = payloadToBits('1w');
    expect(Array.from(bits)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('aisCharFromBits', () => {
  it('maps 0-31 to ASCII 64-95 (@ A-Z [\\\\]^_)', () => {
    expect(aisCharFromBits(0)).toBe('@');
    expect(aisCharFromBits(1)).toBe('A');
    expect(aisCharFromBits(26)).toBe('Z');
    expect(aisCharFromBits(31)).toBe('_');
  });

  it('maps 32-63 to ASCII 32-63 (space, digits, punctuation)', () => {
    expect(aisCharFromBits(32)).toBe(' ');
    expect(aisCharFromBits(48)).toBe('0');
    expect(aisCharFromBits(57)).toBe('9');
    expect(aisCharFromBits(63)).toBe('?');
  });

  it('throws on out-of-range bit values', () => {
    expect(() => aisCharFromBits(-1)).toThrow();
    expect(() => aisCharFromBits(64)).toThrow();
  });
});

describe('BitReader', () => {
  it('starts at position 0 and reports remaining', () => {
    const reader = new BitReader(payloadToBits('00'));
    expect(reader.position()).toBe(0);
    expect(reader.remaining()).toBe(12);
  });

  it('reads unsigned integers of arbitrary width', () => {
    const reader = new BitReader(payloadToBits('1'));
    expect(reader.readUInt(6)).toBe(1);
    expect(reader.position()).toBe(6);
  });

  it('reads across character boundaries', () => {
    const reader = new BitReader(payloadToBits('1w'));
    expect(reader.readUInt(8)).toBe(0b00000111);
    expect(reader.readUInt(4)).toBe(0b1111);
  });

  it('reads two-complement signed integers', () => {
    const bits = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const reader = new BitReader(bits);
    expect(reader.readInt(8)).toBe(-1);
  });

  it('reads positive signed integers', () => {
    const bits = new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]);
    const reader = new BitReader(bits);
    expect(reader.readInt(8)).toBe(127);
  });

  it('reads strings using the AIS 6-bit character table', () => {
    const reader = new BitReader(payloadToBits('12'));
    expect(reader.readString(2)).toBe('AB');
  });

  it('strips @ null padding from AIS strings (trailing)', () => {
    const reader = new BitReader(payloadToBits('1200'));
    expect(reader.readString(4)).toBe('AB');
  });

  it('strips @ null padding from AIS strings (mid-string)', () => {
    const reader = new BitReader(payloadToBits('1021'));
    expect(reader.readString(4)).toBe('ABA');
  });

  it('throws with readString attribution when requested chars exceed remaining bits', () => {
    const reader = new BitReader(payloadToBits('12'));
    expect(() => reader.readString(5)).toThrow(/readString past end/);
  });

  it('throws on negative readString count', () => {
    const reader = new BitReader(payloadToBits('12'));
    expect(() => reader.readString(-1)).toThrow(/negative count/);
  });

  it('readUInt(0) returns 0 without advancing the cursor', () => {
    const reader = new BitReader(payloadToBits('w'));
    expect(reader.readUInt(0)).toBe(0);
    expect(reader.position()).toBe(0);
  });

  it('readInt(32) round-trips full 32-bit signed values', () => {
    const all = new Uint8Array(32);
    all.fill(1);
    expect(new BitReader(all).readInt(32)).toBe(-1);

    const minInt = new Uint8Array(32);
    minInt[0] = 1;
    expect(new BitReader(minInt).readInt(32)).toBe(-2_147_483_648);

    const maxInt = new Uint8Array(32);
    for (let i = 1; i < 32; i += 1) maxInt[i] = 1;
    expect(new BitReader(maxInt).readInt(32)).toBe(2_147_483_647);

    const zero = new Uint8Array(32);
    expect(new BitReader(zero).readInt(32)).toBe(0);
  });

  it('payloadToBits handles empty input', () => {
    expect(payloadToBits('').length).toBe(0);
    expect(new BitReader(payloadToBits('')).remaining()).toBe(0);
  });

  it('skip advances the cursor without reading', () => {
    const reader = new BitReader(payloadToBits('1w'));
    reader.skip(6);
    expect(reader.position()).toBe(6);
    expect(reader.readUInt(6)).toBe(63);
  });

  it('throws when reading past the end', () => {
    const reader = new BitReader(payloadToBits('1'));
    expect(() => reader.readUInt(7)).toThrow(/past end/);
  });

  it('throws on invalid skip distances', () => {
    const reader = new BitReader(payloadToBits('1'));
    expect(() => reader.skip(-1)).toThrow();
    expect(() => reader.skip(7)).toThrow();
  });

  it('decodes message id from a known type 1 payload (first 6 bits = 1)', () => {
    const reader = new BitReader(payloadToBits('15M67FC000G?ufbE'));
    expect(reader.readUInt(6)).toBe(1);
  });
});
