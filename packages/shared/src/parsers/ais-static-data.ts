import type { Imo, Mmsi, ShipTypeCode } from '../types/brands';
import type { StaticData, StaticDimensions, StaticEta } from '../types/static-data';
import { BitReader, payloadToBits } from './ais-bits';

const STATIC_DATA_BITS = 424;
const STATIC_DATA_MESSAGE_TYPE = 5;

const ETA_MONTH_MIN = 1;
const ETA_MONTH_MAX = 12;
const ETA_DAY_MIN = 1;
const ETA_DAY_MAX = 31;
const ETA_HOUR_UNAVAILABLE = 24;
const ETA_MINUTE_UNAVAILABLE = 60;

const DRAUGHT_SCALE = 10;

const CALL_SIGN_CHARS = 7;
const VESSEL_NAME_CHARS = 20;
const DESTINATION_CHARS = 20;

export class NotStaticDataError extends Error {
  readonly messageType: number;

  constructor(messageType: number) {
    super(`Not a static data message: type ${messageType} (expected ${STATIC_DATA_MESSAGE_TYPE})`);
    this.messageType = messageType;
    this.name = 'NotStaticDataError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StaticDataTooShortError extends Error {
  readonly bitLength: number;

  constructor(bitLength: number) {
    super(`StaticData requires at least ${STATIC_DATA_BITS} bits, got ${bitLength}`);
    this.bitLength = bitLength;
    this.name = 'StaticDataTooShortError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function decodeEtaField(value: number, min: number, max: number): number | null {
  if (value < min || value > max) return null;
  return value;
}

export function decodeStaticData(payload: string): StaticData {
  const bits = payloadToBits(payload);
  if (bits.length < STATIC_DATA_BITS) {
    throw new StaticDataTooShortError(bits.length);
  }

  const reader = new BitReader(bits);

  const messageType = reader.readUInt(6);
  if (messageType !== STATIC_DATA_MESSAGE_TYPE) {
    throw new NotStaticDataError(messageType);
  }

  const repeatIndicator = reader.readUInt(2);
  const mmsi = reader.readUInt(30);
  const aisVersion = reader.readUInt(2);

  const imoRaw = reader.readUInt(30);
  const imo = imoRaw === 0 ? null : imoRaw;

  const callSign = reader.readString(CALL_SIGN_CHARS);
  const vesselName = reader.readString(VESSEL_NAME_CHARS);
  const shipType = reader.readUInt(8);

  const toBow = reader.readUInt(9);
  const toStern = reader.readUInt(9);
  const toPort = reader.readUInt(6);
  const toStarboard = reader.readUInt(6);
  const dimensions: StaticDimensions | null =
    toBow === 0 && toStern === 0 && toPort === 0 && toStarboard === 0
      ? null
      : { toBow, toStern, toPort, toStarboard };

  const epfdType = reader.readUInt(4);

  const etaMonth = reader.readUInt(4);
  const etaDay = reader.readUInt(5);
  const etaHour = reader.readUInt(5);
  const etaMinute = reader.readUInt(6);
  const eta: StaticEta = {
    month: decodeEtaField(etaMonth, ETA_MONTH_MIN, ETA_MONTH_MAX),
    day: decodeEtaField(etaDay, ETA_DAY_MIN, ETA_DAY_MAX),
    hour: etaHour === ETA_HOUR_UNAVAILABLE ? null : etaHour,
    minute: etaMinute === ETA_MINUTE_UNAVAILABLE ? null : etaMinute,
  };

  const draughtRaw = reader.readUInt(8);
  const draught = draughtRaw === 0 ? null : draughtRaw / DRAUGHT_SCALE;

  const destination = reader.readString(DESTINATION_CHARS);
  const dte = reader.readUInt(1) === 0;

  return {
    messageType: STATIC_DATA_MESSAGE_TYPE,
    repeatIndicator,
    mmsi: mmsi as Mmsi,
    aisVersion,
    imo: imo as Imo | null,
    callSign,
    vesselName,
    shipType: shipType as ShipTypeCode,
    dimensions,
    epfdType,
    eta,
    draught,
    destination,
    dte,
  };
}
