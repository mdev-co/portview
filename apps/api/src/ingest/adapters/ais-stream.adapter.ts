import type {
  AisMessage,
  ClassBPositionReport,
  ClassBStaticData,
  Imo,
  Mmsi,
  PositionReport,
  ShipTypeCode,
  StaticData,
} from '@sps/shared';
import { CLASS_B_STATIC_PART_A, CLASS_B_STATIC_PART_B } from '@sps/shared';
import {
  AIS_COG_UNKNOWN_SENTINEL,
  AIS_EPFD_TYPE_DEFAULT,
  AIS_HEADING_UNKNOWN_SENTINEL,
  AIS_LAT_UNKNOWN_SENTINEL,
  AIS_LNG_UNKNOWN_SENTINEL,
  AIS_MANEUVER_INDICATOR_DEFAULT,
  AIS_NAV_STATUS_UNKNOWN,
  AIS_RADIO_STATUS_DEFAULT,
  AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND,
  AIS_RATE_OF_TURN_UNKNOWN_SENTINEL,
  AIS_REPEAT_INDICATOR_DEFAULT,
  AIS_SHIP_TYPE_DEFAULT,
  AIS_SOG_UNKNOWN_THRESHOLD,
  AIS_VERSION_DEFAULT,
} from '@sps/shared';

/**
 * Boundary adapter for the AIS Stream WebSocket JSON feed.
 *
 * AIS Stream wraps every ITU-R M.1371 message as
 *   { Message: { <PayloadKind>: <Fields> }, MessageType, MetaData }
 *
 * The adapter handles the three payload kinds the SPS pipeline supports:
 *
 *   PositionReport             -> AisMessage type 1/2/3
 *   StandardClassBPositionReport -> AisMessage type 18
 *   ShipStaticData             -> AisMessage type 5
 *
 * Sentinel handling matches the parsers in @sps/shared and the spec
 * constants in `types/ais-spec.ts`. Anything else (unknown payload
 * kind, missing required field, malformed JSON, off-spec coordinate)
 * is rejected. The ingest service then counts the frame as rejected on
 * the FSM and writes a DLQ entry.
 */

export type AisStreamAdapterRejection =
  | { readonly kind: 'malformed-json'; readonly detail: string }
  | { readonly kind: 'missing-message' }
  | { readonly kind: 'unsupported-payload'; readonly payloadKind: string }
  | { readonly kind: 'invalid-payload'; readonly detail: string };

export type AisStreamAdapterResult =
  | { readonly kind: 'message'; readonly value: AisMessage }
  | { readonly kind: 'rejected'; readonly reason: AisStreamAdapterRejection };

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  const numeric = asNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullIfSentinel(value: number | null, sentinel: number): number | null {
  if (value === null) return null;
  return value === sentinel ? null : value;
}

function nullIfSog(value: number | null): number | null {
  if (value === null) return null;
  return value >= AIS_SOG_UNKNOWN_THRESHOLD ? null : value;
}

function decodeRateOfTurn(value: unknown): number | null {
  const numeric = asNumber(value);
  if (numeric === null) return null;
  if (numeric === AIS_RATE_OF_TURN_UNKNOWN_SENTINEL) return null;
  if (Math.abs(numeric) >= AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND) return null;
  return numeric;
}

function decodePosition(
  payload: Record<string, unknown>,
): readonly [number, number] | null {
  const lat = nullIfSentinel(
    asNumber(payload['Latitude']),
    AIS_LAT_UNKNOWN_SENTINEL,
  );
  const lng = nullIfSentinel(
    asNumber(payload['Longitude']),
    AIS_LNG_UNKNOWN_SENTINEL,
  );
  return lat === null || lng === null ? null : [lng, lat];
}

function decodeMessageId(payload: Record<string, unknown>): 1 | 2 | 3 {
  const id = asInt(payload['MessageID']);
  return id === 2 ? 2 : id === 3 ? 3 : 1;
}

function decodePositionReport(
  payload: Record<string, unknown>,
  mmsi: Mmsi,
): PositionReport {
  return {
    messageType: decodeMessageId(payload),
    repeatIndicator:
      asInt(payload['RepeatIndicator']) ?? AIS_REPEAT_INDICATOR_DEFAULT,
    mmsi,
    navigationStatus:
      asInt(payload['NavigationalStatus']) ?? AIS_NAV_STATUS_UNKNOWN,
    rateOfTurn: decodeRateOfTurn(payload['RateOfTurn']),
    speedOverGround: nullIfSog(asNumber(payload['Sog'])),
    positionAccuracy: asBool(payload['PositionAccuracy']),
    position: decodePosition(payload),
    courseOverGround: nullIfSentinel(
      asNumber(payload['Cog']),
      AIS_COG_UNKNOWN_SENTINEL,
    ),
    trueHeading: nullIfSentinel(
      asInt(payload['TrueHeading']),
      AIS_HEADING_UNKNOWN_SENTINEL,
    ),
    timestamp: asInt(payload['Timestamp']),
    maneuverIndicator:
      asInt(payload['SpecialManoeuvreIndicator']) ??
      AIS_MANEUVER_INDICATOR_DEFAULT,
    raim: asBool(payload['Raim']),
    radioStatus:
      asInt(payload['CommunicationState']) ?? AIS_RADIO_STATUS_DEFAULT,
  };
}

function decodeClassBPosition(
  payload: Record<string, unknown>,
  mmsi: Mmsi,
): ClassBPositionReport {
  return {
    messageType: 18,
    repeatIndicator:
      asInt(payload['RepeatIndicator']) ?? AIS_REPEAT_INDICATOR_DEFAULT,
    mmsi,
    speedOverGround: nullIfSog(asNumber(payload['Sog'])),
    positionAccuracy: asBool(payload['PositionAccuracy']),
    position: decodePosition(payload),
    courseOverGround: nullIfSentinel(
      asNumber(payload['Cog']),
      AIS_COG_UNKNOWN_SENTINEL,
    ),
    trueHeading: nullIfSentinel(
      asInt(payload['TrueHeading']),
      AIS_HEADING_UNKNOWN_SENTINEL,
    ),
    timestamp: asInt(payload['Timestamp']),
    csUnit: asBool(payload['ClassBUnit']),
    displayFlag: asBool(payload['ClassBDisplay']),
    dscFlag: asBool(payload['ClassBDsc']),
    bandFlag: asBool(payload['ClassBBand']),
    message22Flag: asBool(payload['ClassBMsg22']),
    assignedFlag: asBool(payload['AssignedMode']),
    raim: asBool(payload['Raim']),
    radioStatus:
      asInt(payload['CommunicationState']) ?? AIS_RADIO_STATUS_DEFAULT,
  };
}

function decodeClassBStaticData(
  payload: Record<string, unknown>,
  mmsi: Mmsi,
): ClassBStaticData {
  const partNumber =
    asInt(payload['PartNumber']) === CLASS_B_STATIC_PART_B
      ? CLASS_B_STATIC_PART_B
      : CLASS_B_STATIC_PART_A;
  const dimensions = asObject(payload['Dimension']);
  return {
    messageType: 24,
    repeatIndicator:
      asInt(payload['RepeatIndicator']) ?? AIS_REPEAT_INDICATOR_DEFAULT,
    mmsi,
    partNumber,
    vesselName: asString(payload['Name']).trim(),
    callSign: asString(payload['CallSign']).trim(),
    shipType: (asInt(payload['Type']) ?? AIS_SHIP_TYPE_DEFAULT) as ShipTypeCode,
    dimensions:
      dimensions === null
        ? null
        : {
            toBow: asInt(dimensions['A']) ?? 0,
            toStern: asInt(dimensions['B']) ?? 0,
            toPort: asInt(dimensions['C']) ?? 0,
            toStarboard: asInt(dimensions['D']) ?? 0,
          },
    vendorId: asString(payload['VendorID']).trim(),
    mothershipMmsi: asInt(payload['MothershipMmsi']) as Mmsi | null,
  };
}

function decodeStaticData(
  payload: Record<string, unknown>,
  mmsi: Mmsi,
): StaticData {
  const eta = asObject(payload['Eta']) ?? {};
  const dimensions = asObject(payload['Dimension']);
  return {
    messageType: 5,
    repeatIndicator:
      asInt(payload['RepeatIndicator']) ?? AIS_REPEAT_INDICATOR_DEFAULT,
    mmsi,
    aisVersion: asInt(payload['AisVersion']) ?? AIS_VERSION_DEFAULT,
    imo: asInt(payload['ImoNumber']) as Imo | null,
    callSign: asString(payload['CallSign']).trim(),
    vesselName: asString(payload['Name']).trim(),
    shipType: (asInt(payload['Type']) ?? AIS_SHIP_TYPE_DEFAULT) as ShipTypeCode,
    dimensions:
      dimensions === null
        ? null
        : {
            toBow: asInt(dimensions['A']) ?? 0,
            toStern: asInt(dimensions['B']) ?? 0,
            toPort: asInt(dimensions['C']) ?? 0,
            toStarboard: asInt(dimensions['D']) ?? 0,
          },
    epfdType: asInt(payload['FixType']) ?? AIS_EPFD_TYPE_DEFAULT,
    eta: {
      month: asInt(eta['Month']),
      day: asInt(eta['Day']),
      hour: asInt(eta['Hour']),
      minute: asInt(eta['Minute']),
    },
    draught: asNumber(payload['MaximumStaticDraught']),
    destination: asString(payload['Destination']).trim(),
    dte: asBool(payload['Dte']),
  };
}

export function adaptAisStreamMessage(raw: string): AisStreamAdapterResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      kind: 'rejected',
      reason: { kind: 'malformed-json', detail: String(error) },
    };
  }

  const root = asObject(parsed);
  if (root === null) {
    return { kind: 'rejected', reason: { kind: 'missing-message' } };
  }

  const message = asObject(root['Message']);
  if (message === null) {
    return { kind: 'rejected', reason: { kind: 'missing-message' } };
  }

  const meta = asObject(root['MetaData']);

  const positionReport = asObject(message['PositionReport']);
  const classBPosition = asObject(message['StandardClassBPositionReport']);
  const staticData = asObject(message['ShipStaticData']);
  const classBStatic = asObject(message['StaticDataReport']);

  if (positionReport !== null) {
    const mmsi =
      asInt(positionReport['UserID']) ?? (meta ? asInt(meta['MMSI']) : null);
    if (mmsi === null) {
      return {
        kind: 'rejected',
        reason: { kind: 'invalid-payload', detail: 'missing mmsi' },
      };
    }
    return {
      kind: 'message',
      value: decodePositionReport(positionReport, mmsi as Mmsi),
    };
  }

  if (classBPosition !== null) {
    const mmsi =
      asInt(classBPosition['UserID']) ?? (meta ? asInt(meta['MMSI']) : null);
    if (mmsi === null) {
      return {
        kind: 'rejected',
        reason: { kind: 'invalid-payload', detail: 'missing mmsi' },
      };
    }
    return {
      kind: 'message',
      value: decodeClassBPosition(classBPosition, mmsi as Mmsi),
    };
  }

  if (staticData !== null) {
    const mmsi =
      asInt(staticData['UserID']) ?? (meta ? asInt(meta['MMSI']) : null);
    if (mmsi === null) {
      return {
        kind: 'rejected',
        reason: { kind: 'invalid-payload', detail: 'missing mmsi' },
      };
    }
    return {
      kind: 'message',
      value: decodeStaticData(staticData, mmsi as Mmsi),
    };
  }

  if (classBStatic !== null) {
    const mmsi =
      asInt(classBStatic['UserID']) ?? (meta ? asInt(meta['MMSI']) : null);
    if (mmsi === null) {
      return {
        kind: 'rejected',
        reason: { kind: 'invalid-payload', detail: 'missing mmsi' },
      };
    }
    return {
      kind: 'message',
      value: decodeClassBStaticData(classBStatic, mmsi as Mmsi),
    };
  }

  const messageType = asString(root['MessageType']);
  return {
    kind: 'rejected',
    reason: {
      kind: 'unsupported-payload',
      payloadKind:
        messageType.length > 0
          ? messageType
          : Object.keys(message).join(',') || 'unknown',
    },
  };
}
