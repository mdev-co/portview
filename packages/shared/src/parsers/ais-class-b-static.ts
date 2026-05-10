import type { Mmsi, ShipTypeCode } from '../types/brands';
import {
  CLASS_B_STATIC_PART_A,
  CLASS_B_STATIC_PART_B,
  type ClassBStaticData,
  type ClassBStaticPart,
} from '../types/class-b-static';
import type { StaticDimensions } from '../types/static-data';
import { BitReader, payloadToBits } from './ais-bits';

const CLASS_B_STATIC_MESSAGE_TYPE = 24;

/**
 * Common header (40 bits): messageType + repeatIndicator + mmsi + partNumber.
 * PartA continues with 120 bits of vesselName (20 ASCII chars × 6 bits).
 * PartB continues with shipType + vendorId + callSign + dimensions + spare.
 *
 * Per ITU-R M.1371-5 §3.3.8.4.4 the spec gives PartA = 160, PartB = 168
 * total bits. AIVDM repeaters routinely pad up to 168, so we treat 160
 * as the floor and read only what the partNumber requires.
 */
const CLASS_B_STATIC_HEADER_BITS = 40;
const CLASS_B_STATIC_PART_A_BITS = 160;
const CLASS_B_STATIC_PART_B_BITS = 168;

const VESSEL_NAME_CHARS = 20;
const VENDOR_ID_CHARS = 7;
const CALL_SIGN_CHARS = 7;

export class NotClassBStaticError extends Error {
  readonly messageType: number;

  constructor(messageType: number) {
    super(
      `Not a Class B static message: type ${messageType} ` +
        `(expected ${CLASS_B_STATIC_MESSAGE_TYPE})`,
    );
    this.messageType = messageType;
    this.name = 'NotClassBStaticError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ClassBStaticTooShortError extends Error {
  readonly bitLength: number;
  readonly partNumber: ClassBStaticPart | null;

  constructor(bitLength: number, partNumber: ClassBStaticPart | null) {
    const required =
      partNumber === CLASS_B_STATIC_PART_B
        ? CLASS_B_STATIC_PART_B_BITS
        : partNumber === CLASS_B_STATIC_PART_A
          ? CLASS_B_STATIC_PART_A_BITS
          : CLASS_B_STATIC_HEADER_BITS;
    super(
      `Class B static part ${partNumber ?? '?'} requires at least ` +
        `${required} bits, got ${bitLength}`,
    );
    this.bitLength = bitLength;
    this.partNumber = partNumber;
    this.name = 'ClassBStaticTooShortError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Decode an AIVDM type 24 payload into a `ClassBStaticData`. The
 * partNumber bit determines which fields the rest of the payload
 * carries; PartA produces a frame with `vesselName` populated and the
 * other fields at empty / default, PartB produces the inverse. The FE
 * store merges both parts by MMSI (see `vessel-static.store#setVesselStatic`).
 */
export function decodeClassBStaticData(payload: string): ClassBStaticData {
  const bits = payloadToBits(payload);
  if (bits.length < CLASS_B_STATIC_HEADER_BITS) {
    throw new ClassBStaticTooShortError(bits.length, null);
  }

  const reader = new BitReader(bits);

  const messageType = reader.readUInt(6);
  if (messageType !== CLASS_B_STATIC_MESSAGE_TYPE) {
    throw new NotClassBStaticError(messageType);
  }

  const repeatIndicator = reader.readUInt(2);
  const mmsi = reader.readUInt(30);
  const partNumberRaw = reader.readUInt(2);
  const partNumber: ClassBStaticPart =
    partNumberRaw === CLASS_B_STATIC_PART_B ? CLASS_B_STATIC_PART_B : CLASS_B_STATIC_PART_A;

  if (partNumber === CLASS_B_STATIC_PART_A) {
    if (bits.length < CLASS_B_STATIC_PART_A_BITS) {
      throw new ClassBStaticTooShortError(bits.length, partNumber);
    }
    const vesselName = reader.readString(VESSEL_NAME_CHARS);
    return {
      messageType: CLASS_B_STATIC_MESSAGE_TYPE,
      repeatIndicator,
      mmsi: mmsi as Mmsi,
      partNumber,
      vesselName,
      callSign: '',
      shipType: 0 as ShipTypeCode,
      dimensions: null,
      vendorId: '',
      mothershipMmsi: null,
    };
  }

  if (bits.length < CLASS_B_STATIC_PART_B_BITS) {
    throw new ClassBStaticTooShortError(bits.length, partNumber);
  }

  const shipType = reader.readUInt(8);
  const vendorId = reader.readString(VENDOR_ID_CHARS);
  const callSign = reader.readString(CALL_SIGN_CHARS);

  const toBow = reader.readUInt(9);
  const toStern = reader.readUInt(9);
  const toPort = reader.readUInt(6);
  const toStarboard = reader.readUInt(6);
  const dimensions: StaticDimensions | null =
    toBow === 0 && toStern === 0 && toPort === 0 && toStarboard === 0
      ? null
      : { toBow, toStern, toPort, toStarboard };

  return {
    messageType: CLASS_B_STATIC_MESSAGE_TYPE,
    repeatIndicator,
    mmsi: mmsi as Mmsi,
    partNumber,
    vesselName: '',
    callSign,
    shipType: shipType as ShipTypeCode,
    dimensions,
    vendorId,
    mothershipMmsi: null,
  };
}
