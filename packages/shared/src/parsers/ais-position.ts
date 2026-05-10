import type { Mmsi } from '../types/brands';
import type { LngLat } from '../types/geo';
import type { PositionReport } from '../types/vessel';
import { BitReader, payloadToBits } from './ais-bits';

const POSITION_REPORT_BITS = 168;
const COORD_SCALE = 600_000;
const LON_UNAVAILABLE_RAW = 181 * COORD_SCALE;
const LAT_UNAVAILABLE_RAW = 91 * COORD_SCALE;
const ROT_UNAVAILABLE_RAW = -128;
const SOG_UNAVAILABLE_RAW = 1023;
const COG_UNAVAILABLE_RAW = 3600;
const HEADING_UNAVAILABLE_RAW = 511;
const TIMESTAMP_THRESHOLD = 60;

export class NotAPositionReportError extends Error {
  readonly messageType: number;

  constructor(messageType: number) {
    super(`Not a position report: message type ${messageType} (expected 1, 2, or 3)`);
    this.messageType = messageType;
    this.name = 'NotAPositionReportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PositionReportTooShortError extends Error {
  readonly bitLength: number;

  constructor(bitLength: number) {
    super(`PositionReport requires at least ${POSITION_REPORT_BITS} bits, got ${bitLength}`);
    this.bitLength = bitLength;
    this.name = 'PositionReportTooShortError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function decodePositionReport(payload: string): PositionReport {
  const bits = payloadToBits(payload);
  if (bits.length < POSITION_REPORT_BITS) {
    throw new PositionReportTooShortError(bits.length);
  }

  const reader = new BitReader(bits);

  const messageType = reader.readUInt(6);
  if (messageType !== 1 && messageType !== 2 && messageType !== 3) {
    throw new NotAPositionReportError(messageType);
  }

  const repeatIndicator = reader.readUInt(2);
  const mmsi = reader.readUInt(30);
  const navigationStatus = reader.readUInt(4);

  const rotRaw = reader.readInt(8);
  const rateOfTurn = rotRaw === ROT_UNAVAILABLE_RAW ? null : rotRaw;

  const sogRaw = reader.readUInt(10);
  const speedOverGround = sogRaw === SOG_UNAVAILABLE_RAW ? null : sogRaw / 10;

  const positionAccuracy = reader.readUInt(1) === 1;

  const lonRaw = reader.readInt(28);
  const latRaw = reader.readInt(27);
  const position: LngLat | null =
    lonRaw === LON_UNAVAILABLE_RAW || latRaw === LAT_UNAVAILABLE_RAW
      ? null
      : [lonRaw / COORD_SCALE, latRaw / COORD_SCALE];

  const cogRaw = reader.readUInt(12);
  const courseOverGround = cogRaw === COG_UNAVAILABLE_RAW ? null : cogRaw / 10;

  const headingRaw = reader.readUInt(9);
  const trueHeading = headingRaw === HEADING_UNAVAILABLE_RAW ? null : headingRaw;

  const timestampRaw = reader.readUInt(6);
  const timestamp = timestampRaw >= TIMESTAMP_THRESHOLD ? null : timestampRaw;

  const maneuverIndicator = reader.readUInt(2);
  reader.skip(3);
  const raim = reader.readUInt(1) === 1;
  const radioStatus = reader.readUInt(19);

  return {
    messageType: messageType as 1 | 2 | 3,
    repeatIndicator,
    mmsi: mmsi as Mmsi,
    navigationStatus,
    rateOfTurn,
    speedOverGround,
    positionAccuracy,
    position,
    courseOverGround,
    trueHeading,
    timestamp,
    maneuverIndicator,
    raim,
    radioStatus,
  };
}
