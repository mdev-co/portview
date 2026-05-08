import type {
  AisMessage,
  ClassBPositionReport,
  PositionReport,
  StaticData,
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
 * Sentinel handling matches the parsers in @sps/shared:
 *   RateOfTurn          -128, +-127.x = unknown -> null
 *   Sog                 102.3, 102.4 = unknown -> null
 *   Cog                 360 = unknown -> null
 *   TrueHeading         511 = unknown -> null
 *   Latitude/Longitude  91 / 181 = unknown -> null
 *
 * Anything else (unknown payload kind, missing required field, malformed
 * JSON, off-spec coordinate) returns `null`. The ingest service then
 * counts the frame as rejected on the FSM and writes a DLQ entry.
 */

export type AisStreamAdapterRejection =
  | { readonly kind: 'malformed-json'; readonly detail: string }
  | { readonly kind: 'missing-message' }
  | { readonly kind: 'unsupported-payload'; readonly payloadKind: string }
  | { readonly kind: 'invalid-payload'; readonly detail: string };

export type AisStreamAdapterResult =
  | { readonly kind: 'message'; readonly value: AisMessage }
  | { readonly kind: 'rejected'; readonly reason: AisStreamAdapterRejection };

const SENTINEL_LAT_UNKNOWN = 91;
const SENTINEL_LNG_UNKNOWN = 181;
const SENTINEL_HEADING_UNKNOWN = 511;
const SENTINEL_COG_UNKNOWN = 360;
const SENTINEL_SOG_UNKNOWN_LOWER = 102.3;
const SENTINEL_ROT_UNKNOWN = -128;

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  const n = asNumber(value);
  return n === null ? null : Math.trunc(n);
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
  return value >= SENTINEL_SOG_UNKNOWN_LOWER ? null : value;
}

function decodeRateOfTurn(value: unknown): number | null {
  const n = asNumber(value);
  if (n === null) return null;
  if (n === SENTINEL_ROT_UNKNOWN) return null;
  if (Math.abs(n) >= 127.5) return null;
  return n;
}

function decodePosition(
  payload: Record<string, unknown>,
): readonly [number, number] | null {
  const lat = nullIfSentinel(
    asNumber(payload['Latitude']),
    SENTINEL_LAT_UNKNOWN,
  );
  const lng = nullIfSentinel(
    asNumber(payload['Longitude']),
    SENTINEL_LNG_UNKNOWN,
  );
  return lat === null || lng === null ? null : [lng, lat];
}

function decodeMessageId(payload: Record<string, unknown>): 1 | 2 | 3 {
  const id = asInt(payload['MessageID']);
  return id === 2 ? 2 : id === 3 ? 3 : 1;
}

function decodePositionReport(
  payload: Record<string, unknown>,
  mmsi: number,
): PositionReport | null {
  return {
    messageType: decodeMessageId(payload),
    repeatIndicator: asInt(payload['RepeatIndicator']) ?? 0,
    mmsi,
    navigationStatus: asInt(payload['NavigationalStatus']) ?? 15,
    rateOfTurn: decodeRateOfTurn(payload['RateOfTurn']),
    speedOverGround: nullIfSog(asNumber(payload['Sog'])),
    positionAccuracy: asBool(payload['PositionAccuracy']),
    position: decodePosition(payload),
    courseOverGround: nullIfSentinel(
      asNumber(payload['Cog']),
      SENTINEL_COG_UNKNOWN,
    ),
    trueHeading: nullIfSentinel(
      asInt(payload['TrueHeading']),
      SENTINEL_HEADING_UNKNOWN,
    ),
    timestamp: asInt(payload['Timestamp']),
    maneuverIndicator: asInt(payload['SpecialManoeuvreIndicator']) ?? 0,
    raim: asBool(payload['Raim']),
    radioStatus: asInt(payload['CommunicationState']) ?? 0,
  };
}

function decodeClassBPosition(
  payload: Record<string, unknown>,
  mmsi: number,
): ClassBPositionReport | null {
  return {
    messageType: 18,
    repeatIndicator: asInt(payload['RepeatIndicator']) ?? 0,
    mmsi,
    speedOverGround: nullIfSog(asNumber(payload['Sog'])),
    positionAccuracy: asBool(payload['PositionAccuracy']),
    position: decodePosition(payload),
    courseOverGround: nullIfSentinel(
      asNumber(payload['Cog']),
      SENTINEL_COG_UNKNOWN,
    ),
    trueHeading: nullIfSentinel(
      asInt(payload['TrueHeading']),
      SENTINEL_HEADING_UNKNOWN,
    ),
    timestamp: asInt(payload['Timestamp']),
    csUnit: asBool(payload['ClassBUnit']),
    displayFlag: asBool(payload['ClassBDisplay']),
    dscFlag: asBool(payload['ClassBDsc']),
    bandFlag: asBool(payload['ClassBBand']),
    message22Flag: asBool(payload['ClassBMsg22']),
    assignedFlag: asBool(payload['AssignedMode']),
    raim: asBool(payload['Raim']),
    radioStatus: asInt(payload['CommunicationState']) ?? 0,
  };
}

function decodeStaticData(
  payload: Record<string, unknown>,
  mmsi: number,
): StaticData {
  const eta = asObject(payload['Eta']) ?? {};
  const dimensions = asObject(payload['Dimension']);
  return {
    messageType: 5,
    repeatIndicator: asInt(payload['RepeatIndicator']) ?? 0,
    mmsi,
    aisVersion: asInt(payload['AisVersion']) ?? 0,
    imo: asInt(payload['ImoNumber']),
    callSign: asString(payload['CallSign']).trim(),
    vesselName: asString(payload['Name']).trim(),
    shipType: asInt(payload['Type']) ?? 0,
    dimensions:
      dimensions === null
        ? null
        : {
            toBow: asInt(dimensions['A']) ?? 0,
            toStern: asInt(dimensions['B']) ?? 0,
            toPort: asInt(dimensions['C']) ?? 0,
            toStarboard: asInt(dimensions['D']) ?? 0,
          },
    epfdType: asInt(payload['FixType']) ?? 0,
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
  } catch (err) {
    return {
      kind: 'rejected',
      reason: { kind: 'malformed-json', detail: String(err) },
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

  if (positionReport !== null) {
    const mmsi =
      asInt(positionReport['UserID']) ?? (meta ? asInt(meta['MMSI']) : null);
    if (mmsi === null) {
      return {
        kind: 'rejected',
        reason: { kind: 'invalid-payload', detail: 'missing mmsi' },
      };
    }
    const value = decodePositionReport(positionReport, mmsi);
    if (value === null) {
      return {
        kind: 'rejected',
        reason: {
          kind: 'invalid-payload',
          detail: 'PositionReport decode returned null',
        },
      };
    }
    return { kind: 'message', value };
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
    const value = decodeClassBPosition(classBPosition, mmsi);
    if (value === null) {
      return {
        kind: 'rejected',
        reason: {
          kind: 'invalid-payload',
          detail: 'StandardClassBPositionReport decode returned null',
        },
      };
    }
    return { kind: 'message', value };
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
    return { kind: 'message', value: decodeStaticData(staticData, mmsi) };
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
