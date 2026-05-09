export function sixbitFromChar(charCode: number): number {
  if (charCode >= 48 && charCode < 88) return charCode - 48;
  if (charCode >= 96 && charCode < 120) return charCode - 56;
  throw new Error(`Invalid AIS sixbit character: ${charCode}`);
}

export function payloadToBits(payload: string): Uint8Array {
  const bits = new Uint8Array(payload.length * 6);
  for (let i = 0; i < payload.length; i += 1) {
    const value = sixbitFromChar(payload.charCodeAt(i));
    for (let b = 0; b < 6; b += 1) {
      bits[i * 6 + b] = (value >> (5 - b)) & 1;
    }
  }
  return bits;
}

export function aisCharFromBits(bits: number): string {
  if (bits < 0 || bits > 63) {
    throw new Error(`Invalid 6-bit AIS character value: ${bits}`);
  }
  if (bits < 32) return String.fromCharCode(64 + bits);
  return String.fromCharCode(bits);
}

export class BitReader {
  private cursor = 0;
  private readonly bits: Uint8Array;

  constructor(bits: Uint8Array) {
    this.bits = bits;
  }

  position(): number {
    return this.cursor;
  }

  remaining(): number {
    return this.bits.length - this.cursor;
  }

  skip(n: number): void {
    if (n < 0) throw new Error(`BitReader.skip: negative count ${n}`);
    if (this.cursor + n > this.bits.length) {
      throw new Error(
        `BitReader.skip past end (cursor=${this.cursor}, n=${n}, len=${this.bits.length})`,
      );
    }
    this.cursor += n;
  }

  readUInt(n: number): number {
    if (n < 0 || n > 32) throw new Error(`BitReader.readUInt: width out of range ${n}`);
    if (this.cursor + n > this.bits.length) {
      throw new Error(
        `BitReader.readUInt past end (cursor=${this.cursor}, n=${n}, len=${this.bits.length})`,
      );
    }
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      value = value * 2 + this.bits[this.cursor + i]!;
    }
    this.cursor += n;
    return value;
  }

  readInt(n: number): number {
    if (n < 1 || n > 32) throw new Error(`BitReader.readInt: width out of range ${n}`);
    const u = this.readUInt(n);
    const half = 2 ** (n - 1);
    if (u < half) return u;
    return u - 2 ** n;
  }

  readString(charCount: number): string {
    if (charCount < 0) throw new Error(`BitReader.readString: negative count ${charCount}`);
    const bitsNeeded = charCount * 6;
    if (this.cursor + bitsNeeded > this.bits.length) {
      throw new Error(
        `BitReader.readString past end (cursor=${this.cursor}, charCount=${charCount}, bitsNeeded=${bitsNeeded}, len=${this.bits.length})`,
      );
    }
    let result = '';
    for (let i = 0; i < charCount; i += 1) {
      result += aisCharFromBits(this.readUInt(6));
    }
    return result.replace(/@/g, '').trimEnd();
  }
}
