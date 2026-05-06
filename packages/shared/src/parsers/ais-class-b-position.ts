import type { ClassBPositionReport } from '../types/class-b-position';
import type { LngLat } from '../types/geo';
import { BitReader, payloadToBits } from './ais-bits';

const CLASS_B_POSITION_BITS = 168;
const CLASS_B_MESSAGE_TYPE = 18;

const COORD_SCALE = 600_000;
const LON_UNAVAILABLE_RAW = 181 * COORD_SCALE;
const LAT_UNAVAILABLE_RAW = 91 * COORD_SCALE;
const SOG_UNAVAILABLE_RAW = 1023;
const COG_UNAVAILABLE_RAW = 3600;
const HEADING_UNAVAILABLE_RAW = 511;
const TIMESTAMP_THRESHOLD = 60;

export class NotClassBPositionError extends Error {
  readonly messageType: number;

  constructor(messageType: number) {
    super(`Not a Class B position report: type ${messageType} (expected ${CLASS_B_MESSAGE_TYPE})`);
    this.messageType = messageType;
    this.name = 'NotClassBPositionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ClassBPositionTooShortError extends Error {
  readonly bitLength: number;

  constructor(bitLength: number) {
    super(`ClassBPositionReport requires at least ${CLASS_B_POSITION_BITS} bits, got ${bitLength}`);
    this.bitLength = bitLength;
    this.name = 'ClassBPositionTooShortError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function decodeClassBPositionReport(payload: string): ClassBPositionReport {
  const bits = payloadToBits(payload);
  if (bits.length < CLASS_B_POSITION_BITS) {
    throw new ClassBPositionTooShortError(bits.length);
  }

  const reader = new BitReader(bits);

  const messageType = reader.readUInt(6);
  if (messageType !== CLASS_B_MESSAGE_TYPE) {
    throw new NotClassBPositionError(messageType);
  }

  const repeatIndicator = reader.readUInt(2);
  const mmsi = reader.readUInt(30);
  reader.skip(8);

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

  reader.skip(2);

  const csUnit = reader.readUInt(1) === 1;
  const displayFlag = reader.readUInt(1) === 1;
  const dscFlag = reader.readUInt(1) === 1;
  const bandFlag = reader.readUInt(1) === 1;
  const message22Flag = reader.readUInt(1) === 1;
  const assignedFlag = reader.readUInt(1) === 1;
  const raim = reader.readUInt(1) === 1;
  const radioStatus = reader.readUInt(20);

  return {
    messageType: CLASS_B_MESSAGE_TYPE,
    repeatIndicator,
    mmsi,
    speedOverGround,
    positionAccuracy,
    position,
    courseOverGround,
    trueHeading,
    timestamp,
    csUnit,
    displayFlag,
    dscFlag,
    bandFlag,
    message22Flag,
    assignedFlag,
    raim,
    radioStatus,
  };
}
