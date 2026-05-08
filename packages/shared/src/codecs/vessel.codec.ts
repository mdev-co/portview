import type { SourceId } from '../types/brands';
import { LeDataView } from './le-data-view';

/**
 * Wire-level vessel update frame. Fixed-width, 38 bytes, little-endian.
 *
 * Sentinel encodings (no extra wire bit, all decoded to `null` at the
 * boundary):
 *   navStatus       0xFF = unknown        (AIS NavStatus 15 sentinel)
 *   rateOfTurn      -128 = unknown        (AIS spec 1371 sentinel)
 *   sog/cog         NaN  = unknown        (uses IEEE 754 NaN bit pattern)
 *   trueHeading     0xFFFF = unknown      (AIS heading 511 -> 0xFFFF)
 *   lng/lat         NaN  = unknown        (uses IEEE 754 NaN bit pattern)
 *
 * Schema (all little-endian, no padding):
 *   offset  width  field
 *      0      u8   messageType            1, 2, 3, 5, 18 (AIS spec)
 *      1      u8   navStatus              0..15, 0xFF = unknown
 *      2      u8   sourceId               SourceId enum value (0/1/2)
 *      3      i8   rateOfTurn             AIS raw, -128 = unknown
 *      4      u32  mmsi                   9-digit unsigned
 *      8      f64  lng                    WGS84 degrees, NaN = unknown
 *     16      f64  lat                    WGS84 degrees, NaN = unknown
 *     24      f32  sog                    knots, NaN = unknown
 *     28      f32  cog                    degrees, NaN = unknown
 *     32      u16  trueHeading            degrees, 0xFFFF = unknown
 *     34      u32  timestampUnix          seconds since epoch
 *
 * Total: 38 bytes. JSON equivalent ~150 bytes; ~75% reduction on the
 * wire at 1 Hz per vessel.
 */

export const VESSEL_FRAME_BYTES = 38;

const OFFSET_MESSAGE_TYPE = 0;
const OFFSET_NAV_STATUS = 1;
const OFFSET_SOURCE_ID = 2;
const OFFSET_RATE_OF_TURN = 3;
const OFFSET_MMSI = 4;
const OFFSET_LNG = 8;
const OFFSET_LAT = 16;
const OFFSET_SOG = 24;
const OFFSET_COG = 28;
const OFFSET_TRUE_HEADING = 32;
const OFFSET_TIMESTAMP = 34;

const NAV_STATUS_UNKNOWN = 0xff;
const RATE_OF_TURN_UNKNOWN = -128;
const HEADING_UNKNOWN = 0xffff;

export type VesselUpdateFrame = {
  readonly messageType: number;
  readonly mmsi: number;
  readonly navStatus: number | null;
  readonly sourceId: SourceId;
  readonly rateOfTurn: number | null;
  readonly lng: number | null;
  readonly lat: number | null;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly trueHeading: number | null;
  readonly timestampUnix: number;
};

export function encodeVesselFrame(frame: VesselUpdateFrame): Uint8Array {
  const buffer = new ArrayBuffer(VESSEL_FRAME_BYTES);
  const view = LeDataView.of(buffer);

  view.setU8(OFFSET_MESSAGE_TYPE, frame.messageType);
  view.setU8(OFFSET_NAV_STATUS, frame.navStatus ?? NAV_STATUS_UNKNOWN);
  view.setU8(OFFSET_SOURCE_ID, frame.sourceId);
  view.setI8(OFFSET_RATE_OF_TURN, frame.rateOfTurn ?? RATE_OF_TURN_UNKNOWN);
  view.setU32(OFFSET_MMSI, frame.mmsi);
  view.setF64(OFFSET_LNG, frame.lng ?? Number.NaN);
  view.setF64(OFFSET_LAT, frame.lat ?? Number.NaN);
  view.setF32(OFFSET_SOG, frame.sog ?? Number.NaN);
  view.setF32(OFFSET_COG, frame.cog ?? Number.NaN);
  view.setU16(OFFSET_TRUE_HEADING, frame.trueHeading ?? HEADING_UNKNOWN);
  view.setU32(OFFSET_TIMESTAMP, frame.timestampUnix);

  return new Uint8Array(buffer);
}

export function decodeVesselFrame(bytes: Uint8Array): VesselUpdateFrame {
  if (bytes.byteLength !== VESSEL_FRAME_BYTES) {
    throw new Error(
      `vessel frame must be exactly ${VESSEL_FRAME_BYTES} bytes, got ${bytes.byteLength}`,
    );
  }
  const view = LeDataView.of(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const navStatusRaw = view.getU8(OFFSET_NAV_STATUS);
  const rateOfTurnRaw = view.getI8(OFFSET_RATE_OF_TURN);
  const lngRaw = view.getF64(OFFSET_LNG);
  const latRaw = view.getF64(OFFSET_LAT);
  const sogRaw = view.getF32(OFFSET_SOG);
  const cogRaw = view.getF32(OFFSET_COG);
  const headingRaw = view.getU16(OFFSET_TRUE_HEADING);

  return {
    messageType: view.getU8(OFFSET_MESSAGE_TYPE),
    navStatus: navStatusRaw === NAV_STATUS_UNKNOWN ? null : navStatusRaw,
    sourceId: view.getU8(OFFSET_SOURCE_ID) as SourceId,
    rateOfTurn: rateOfTurnRaw === RATE_OF_TURN_UNKNOWN ? null : rateOfTurnRaw,
    mmsi: view.getU32(OFFSET_MMSI),
    lng: Number.isNaN(lngRaw) ? null : lngRaw,
    lat: Number.isNaN(latRaw) ? null : latRaw,
    sog: Number.isNaN(sogRaw) ? null : sogRaw,
    cog: Number.isNaN(cogRaw) ? null : cogRaw,
    trueHeading: headingRaw === HEADING_UNKNOWN ? null : headingRaw,
    timestampUnix: view.getU32(OFFSET_TIMESTAMP),
  };
}
