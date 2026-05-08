/**
 * Little-endian wrapper around DataView.
 *
 * Every binary frame in SPS is little-endian. The native DataView API
 * accepts an optional `littleEndian` flag per call; forgetting the flag
 * silently flips byte order at runtime. This wrapper hard-codes LE so
 * the codec call sites cannot drift, and so the LE invariant lives in
 * one place.
 *
 * Acts as the smart-constructor analogue for binary reads/writes:
 * outside this module, no codec is allowed to call DataView.set/get*
 * directly.
 */
export class LeDataView {
  private readonly view: DataView;

  constructor(buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number) {
    this.view = new DataView(buffer as ArrayBuffer, byteOffset, byteLength);
  }

  static of(buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number): LeDataView {
    return new LeDataView(buffer, byteOffset, byteLength);
  }

  get byteLength(): number {
    return this.view.byteLength;
  }

  getU8(offset: number): number {
    return this.view.getUint8(offset);
  }
  setU8(offset: number, value: number): void {
    this.view.setUint8(offset, value);
  }

  getI8(offset: number): number {
    return this.view.getInt8(offset);
  }
  setI8(offset: number, value: number): void {
    this.view.setInt8(offset, value);
  }

  getU16(offset: number): number {
    return this.view.getUint16(offset, true);
  }
  setU16(offset: number, value: number): void {
    this.view.setUint16(offset, value, true);
  }

  getU32(offset: number): number {
    return this.view.getUint32(offset, true);
  }
  setU32(offset: number, value: number): void {
    this.view.setUint32(offset, value, true);
  }

  getF32(offset: number): number {
    return this.view.getFloat32(offset, true);
  }
  setF32(offset: number, value: number): void {
    this.view.setFloat32(offset, value, true);
  }

  getF64(offset: number): number {
    return this.view.getFloat64(offset, true);
  }
  setF64(offset: number, value: number): void {
    this.view.setFloat64(offset, value, true);
  }
}
