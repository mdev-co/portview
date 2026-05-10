import {
  AIS_SHIP_TYPE_DEFAULT,
  CLASS_B_STATIC_PART_A,
  type ClassBStaticData,
  type ShipTypeCode,
  type StaticData,
  type StaticEta,
  VESSEL_STATIC_FRAME_KIND,
  type VesselStaticDataFrame,
} from '@sps/shared';
import type { VesselStaticEvent } from '../ingest/ingest.events';

const EMPTY_ETA: StaticEta = {
  month: null,
  day: null,
  hour: null,
  minute: null,
};

/**
 * Convert a validated `VesselStaticEvent` into the JSON-text wire frame
 * the FE consumes. Two source kinds map to the same wire shape:
 *
 *   - AIS type 5 (Class A static + voyage data): every field populated
 *     directly from the message.
 *   - AIS type 24 (Class B static): partial frames - PartA carries
 *     vesselName only, PartB carries callSign + shipType + dimensions.
 *     Class B has no IMO, ETA, destination or draught at all, so those
 *     stay null / empty. The fields the part does NOT carry stay at
 *     defaults; the FE store merges PartA + PartB by MMSI with
 *     null-fallback.
 *
 * `receivedAt` is ms since epoch to stay consistent with the shared
 * `LiveVessel` timestamp scale.
 */
export function buildVesselStaticFrame(
  event: VesselStaticEvent,
): VesselStaticDataFrame {
  if (event.message.messageType === 5) {
    return frameFromClassAStatic(event.message, event.receivedAt);
  }
  return frameFromClassBStatic(event.message, event.receivedAt);
}

function frameFromClassAStatic(
  message: StaticData,
  receivedAt: number,
): VesselStaticDataFrame {
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: message.mmsi,
    vesselName: message.vesselName,
    imo: message.imo,
    callSign: message.callSign,
    shipType: message.shipType,
    dimensions: message.dimensions,
    draught: message.draught,
    destination: message.destination,
    eta: message.eta,
    receivedAt,
  };
}

function frameFromClassBStatic(
  message: ClassBStaticData,
  receivedAt: number,
): VesselStaticDataFrame {
  const isPartA = message.partNumber === CLASS_B_STATIC_PART_A;
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: message.mmsi,
    vesselName: isPartA ? message.vesselName : '',
    imo: null,
    callSign: isPartA ? '' : message.callSign,
    shipType: isPartA
      ? (AIS_SHIP_TYPE_DEFAULT as ShipTypeCode)
      : message.shipType,
    dimensions: isPartA ? null : message.dimensions,
    draught: null,
    destination: '',
    eta: EMPTY_ETA,
    receivedAt,
  };
}
