import { describe, expect, it } from 'vitest';
import { SourceId } from '../../types/brands';
import { LeDataView } from '../le-data-view';
import {
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_FRAME_BYTES,
  type VesselUpdateFrame,
  decodeVesselFrame,
  encodeVesselFrame,
} from '../vessel.codec';

const FULL: VesselUpdateFrame = {
  messageType: 1,
  mmsi: 261_345_678,
  navStatus: 0,
  sourceId: SourceId.LocalUdp,
  rateOfTurn: 12,
  lng: 14.5528,
  lat: 53.4285,
  sog: 12.3,
  cog: 217.4,
  trueHeading: 215,
  timestampUnix: 1_715_000_000,
  flags: VESSEL_FLAG_IS_MOVING | VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_HAS_IDENTITY,
  reserved: 0,
};

describe('vessel codec', () => {
  it('produces a frame of exactly VESSEL_FRAME_BYTES', () => {
    const bytes = encodeVesselFrame(FULL);
    expect(bytes.byteLength).toBe(VESSEL_FRAME_BYTES);
    expect(VESSEL_FRAME_BYTES).toBe(40);
  });

  it('round-trips a fully populated frame', () => {
    const decoded = decodeVesselFrame(encodeVesselFrame(FULL));
    expect(decoded.messageType).toBe(FULL.messageType);
    expect(decoded.mmsi).toBe(FULL.mmsi);
    expect(decoded.navStatus).toBe(FULL.navStatus);
    expect(decoded.sourceId).toBe(FULL.sourceId);
    expect(decoded.rateOfTurn).toBe(FULL.rateOfTurn);
    expect(decoded.lng).toBeCloseTo(FULL.lng!, 9);
    expect(decoded.lat).toBeCloseTo(FULL.lat!, 9);
    expect(decoded.sog).toBeCloseTo(FULL.sog!, 4);
    expect(decoded.cog).toBeCloseTo(FULL.cog!, 4);
    expect(decoded.trueHeading).toBe(FULL.trueHeading);
    expect(decoded.timestampUnix).toBe(FULL.timestampUnix);
    expect(decoded.flags).toBe(FULL.flags);
    expect(decoded.reserved).toBe(FULL.reserved);
  });

  it('round-trips null sentinels for every nullable field', () => {
    const sparse: VesselUpdateFrame = {
      ...FULL,
      navStatus: null,
      rateOfTurn: null,
      lng: null,
      lat: null,
      sog: null,
      cog: null,
      trueHeading: null,
    };
    const decoded = decodeVesselFrame(encodeVesselFrame(sparse));
    expect(decoded.navStatus).toBeNull();
    expect(decoded.rateOfTurn).toBeNull();
    expect(decoded.lng).toBeNull();
    expect(decoded.lat).toBeNull();
    expect(decoded.sog).toBeNull();
    expect(decoded.cog).toBeNull();
    expect(decoded.trueHeading).toBeNull();
    // mmsi, sourceId, messageType, timestamp are non-nullable, must survive
    expect(decoded.mmsi).toBe(sparse.mmsi);
    expect(decoded.timestampUnix).toBe(sparse.timestampUnix);
  });

  it('encodes mmsi as little-endian (low byte first at offset 4)', () => {
    const bytes = encodeVesselFrame(FULL);
    const view = LeDataView.of(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // offset 4 is the mmsi u32 — verify by reading via raw little-endian view.
    expect(view.getU32(4)).toBe(FULL.mmsi);
    // First byte of mmsi (LSB) at offset 4 must equal mmsi & 0xff.
    expect(bytes[4]).toBe(FULL.mmsi & 0xff);
  });

  it('preserves sourceId enum values across round-trip', () => {
    const cases = [SourceId.LocalUdp, SourceId.WebSdr, SourceId.AisStream];
    for (const source of cases) {
      const decoded = decodeVesselFrame(encodeVesselFrame({ ...FULL, sourceId: source }));
      expect(decoded.sourceId).toBe(source);
    }
  });

  it('preserves Class B message type 18 round-trip', () => {
    const decoded = decodeVesselFrame(encodeVesselFrame({ ...FULL, messageType: 18 }));
    expect(decoded.messageType).toBe(18);
  });

  it('rejects a frame of wrong length on decode', () => {
    const tooShort = new Uint8Array(VESSEL_FRAME_BYTES - 1);
    expect(() => decodeVesselFrame(tooShort)).toThrow(/exactly 40 bytes/);
    const tooLong = new Uint8Array(VESSEL_FRAME_BYTES + 1);
    expect(() => decodeVesselFrame(tooLong)).toThrow(/exactly 40 bytes/);
  });

  it('round-trips every individual flag bit', () => {
    const flagSet = [VESSEL_FLAG_IS_MOVING, VESSEL_FLAG_HAS_FIX, VESSEL_FLAG_HAS_IDENTITY];
    for (const flag of flagSet) {
      const decoded = decodeVesselFrame(encodeVesselFrame({ ...FULL, flags: flag }));
      expect(decoded.flags).toBe(flag);
    }
  });

  it('writes flags at offset 38 and reserved at offset 39', () => {
    const bytes = encodeVesselFrame({
      ...FULL,
      flags: VESSEL_FLAG_HAS_FIX,
      reserved: 0,
    });
    expect(bytes[38]).toBe(VESSEL_FLAG_HAS_FIX);
    expect(bytes[39]).toBe(0);
  });

  it('encodes negative rateOfTurn as a signed byte', () => {
    const decoded = decodeVesselFrame(encodeVesselFrame({ ...FULL, rateOfTurn: -10 }));
    expect(decoded.rateOfTurn).toBe(-10);
  });

  it('treats explicit -128 rateOfTurn as the unknown sentinel', () => {
    const bytes = encodeVesselFrame({ ...FULL, rateOfTurn: null });
    // The wire byte at offset 3 must be the signed -128 representation (0x80).
    expect(bytes[3]).toBe(0x80);
    expect(decodeVesselFrame(bytes).rateOfTurn).toBeNull();
  });

  it('handles polar / out-of-range edge coordinates without losing precision', () => {
    const polar: VesselUpdateFrame = {
      ...FULL,
      lng: -179.999_999_999,
      lat: 89.999_999_999,
    };
    const decoded = decodeVesselFrame(encodeVesselFrame(polar));
    expect(decoded.lng).toBeCloseTo(polar.lng!, 9);
    expect(decoded.lat).toBeCloseTo(polar.lat!, 9);
  });
});
