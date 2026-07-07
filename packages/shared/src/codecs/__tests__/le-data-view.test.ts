import { describe, expect, it } from 'vitest';
import { LeDataView } from '../le-data-view';

describe('LeDataView', () => {
  it('writes multi-byte values LSB-first (little-endian invariant)', () => {
    const bytes = new Uint8Array(8);
    const view = LeDataView.of(bytes.buffer);

    view.setU16(0, 0x1234);
    expect([...bytes.subarray(0, 2)]).toEqual([0x34, 0x12]);

    view.setU32(0, 0xdeadbeef);
    expect([...bytes.subarray(0, 4)]).toEqual([0xef, 0xbe, 0xad, 0xde]);
  });

  it('reads multi-byte values LSB-first', () => {
    const bytes = new Uint8Array([0x34, 0x12, 0xef, 0xbe, 0xad, 0xde, 0x00, 0x00]);
    const view = LeDataView.of(bytes.buffer);

    expect(view.getU16(0)).toBe(0x1234);
    expect(view.getU32(2)).toBe(0xdeadbeef);
  });

  it('round-trips signed and unsigned single bytes', () => {
    const view = LeDataView.of(new ArrayBuffer(2));

    view.setI8(0, -128);
    expect(view.getI8(0)).toBe(-128);
    expect(view.getU8(0)).toBe(0x80);

    view.setU8(1, 0xff);
    expect(view.getU8(1)).toBe(0xff);
    expect(view.getI8(1)).toBe(-1);
  });

  it('round-trips floats at their native precision', () => {
    const view = LeDataView.of(new ArrayBuffer(12));

    view.setF64(0, Math.PI);
    expect(view.getF64(0)).toBe(Math.PI);

    view.setF32(8, 359.9);
    expect(view.getF32(8)).toBeCloseTo(359.9, 4);
  });

  it('respects byteOffset into a shared buffer (subarray decode path)', () => {
    const backing = new Uint8Array(16);
    const view = LeDataView.of(backing.buffer, 4, 8);

    view.setU32(0, 0x01020304);
    expect(view.byteLength).toBe(8);
    expect([...backing.subarray(4, 8)]).toEqual([0x04, 0x03, 0x02, 0x01]);
    expect(backing[0]).toBe(0);
  });

  it('delegates out-of-bounds access to the native RangeError', () => {
    const view = LeDataView.of(new ArrayBuffer(4));
    expect(() => view.getU32(1)).toThrow(RangeError);
    expect(() => view.setF64(0, 1)).toThrow(RangeError);
  });
});
