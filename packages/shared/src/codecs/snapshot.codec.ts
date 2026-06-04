import { Field, Root, Type } from 'protobufjs/light';
import type { Imo, Mmsi, ShipTypeCode } from '../types/brands';
import type { StaticDimensions, StaticEta } from '../types/static-data';
import {
  VESSEL_SNAPSHOT_FRAME_KIND,
  type VesselHistoryPoint,
  type VesselKalmanState,
  type VesselSnapshotEntry,
  type VesselSnapshotFrame,
} from '../types/vessel-snapshot';
import { VESSEL_STATIC_FRAME_KIND, type VesselStaticDataFrame } from '../types/vessel-static';

/**
 * One-byte type marker prepended to every variable-length binary
 * WebSocket frame. Position updates (the existing 40-byte codec) keep
 * their fixed length as the discriminator and do NOT carry this byte.
 * Variable-length frames (snapshot, static) need a marker because the
 * frontend dispatcher cannot tell them apart from length alone.
 *
 * Marker values MUST be disjoint from the legal first byte of a
 * position frame, which carries `messageType` in {1, 2, 3, 5, 18}
 * (AIS message-type range 1..27 by spec). `0xFE` and `0xFF` sit
 * outside the entire valid messageType range, so a dispatcher
 * inspecting `bytes[0]` can route a frame to snapshot/static/position
 * unambiguously even when a variable-length encoder happens to
 * produce a buffer of exactly the position-frame size.
 */
export const BINARY_FRAME_TYPE_SNAPSHOT = 0xfe;
export const BINARY_FRAME_TYPE_STATIC = 0xff;

/**
 * Binary codec for the cold-start vessel snapshot frame.
 *
 * The snapshot used to ship as JSON (text WebSocket frame) which made
 * the full data model trivially readable from browser DevTools - every
 * field name (`mmsi`, `staticData`, `kalman`, `sourceId`, ...) was
 * inline in the response. Encoding via Protobuf with numeric field
 * tags strips that surface: a passive observer sees `<Binary Message N
 * bytes>` and a stream of opaque bytes; without this schema the layout
 * cannot be reconstructed.
 *
 * Schema is defined programmatically via `protobufjs/light` (no `.proto`
 * file, no codegen step) so the build pipeline stays single-stage.
 * Field tags MUST be stable: adding a new field uses the next free tag,
 * never reuses an old one, otherwise old clients deserialise the new
 * payload incorrectly.
 *
 * Cost on the wire (typical 67-vessel snapshot in Szczecin port):
 *   JSON.stringify: ~220 KB
 *   Protobuf:       ~80-90 KB
 * Plus the schema is no longer self-documenting, which is the point.
 */

const Dimensions = new Type('Dimensions')
  .add(new Field('toBow', 1, 'int32'))
  .add(new Field('toStern', 2, 'int32'))
  .add(new Field('toPort', 3, 'int32'))
  .add(new Field('toStarboard', 4, 'int32'));

const Eta = new Type('Eta')
  .add(new Field('month', 1, 'int32', 'optional'))
  .add(new Field('day', 2, 'int32', 'optional'))
  .add(new Field('hour', 3, 'int32', 'optional'))
  .add(new Field('minute', 4, 'int32', 'optional'));

const StaticData = new Type('StaticData')
  .add(new Field('mmsi', 1, 'int32'))
  .add(new Field('vesselName', 2, 'string'))
  .add(new Field('imo', 3, 'int32', 'optional'))
  .add(new Field('callSign', 4, 'string'))
  .add(new Field('shipType', 5, 'int32'))
  .add(new Field('dimensions', 6, 'Dimensions', 'optional'))
  .add(new Field('draught', 7, 'double', 'optional'))
  .add(new Field('destination', 8, 'string'))
  .add(new Field('eta', 9, 'Eta'))
  .add(new Field('receivedAt', 10, 'int64'));

const HistoryPoint = new Type('HistoryPoint')
  .add(new Field('lng', 1, 'double'))
  .add(new Field('lat', 2, 'double'))
  .add(new Field('sog', 3, 'double', 'optional'))
  .add(new Field('cog', 4, 'double', 'optional'))
  .add(new Field('trueHeading', 5, 'int32', 'optional'))
  .add(new Field('timestampUnix', 6, 'int64'));

const KalmanState = new Type('KalmanState')
  .add(new Field('lng', 1, 'double'))
  .add(new Field('lat', 2, 'double'))
  .add(new Field('vlng', 3, 'double'))
  .add(new Field('vlat', 4, 'double'))
  .add(new Field('covariance', 5, 'double', 'repeated'))
  .add(new Field('updatedAtUnix', 6, 'int64'));

const SnapshotEntry = new Type('SnapshotEntry')
  .add(new Field('mmsi', 1, 'int32'))
  .add(new Field('staticData', 2, 'StaticData', 'optional'))
  .add(new Field('history', 3, 'HistoryPoint', 'repeated'))
  .add(new Field('kalman', 4, 'KalmanState', 'optional'))
  .add(new Field('sourceId', 5, 'int32', 'optional'));

const SnapshotFrame = new Type('SnapshotFrame')
  .add(new Field('serverTimeUnix', 1, 'int64'))
  .add(new Field('vessels', 2, 'SnapshotEntry', 'repeated'));

const root = new Root();
root
  .define('sps.telemetry')
  .add(Dimensions)
  .add(Eta)
  .add(StaticData)
  .add(HistoryPoint)
  .add(KalmanState)
  .add(SnapshotEntry)
  .add(SnapshotFrame);

const SnapshotFrameType = root.lookupType('sps.telemetry.SnapshotFrame');
const StaticDataType = root.lookupType('sps.telemetry.StaticData');

/**
 * Encode a snapshot frame to a Protobuf wire buffer. The top-level
 * `kind` discriminator is dropped at the wire boundary; the frontend
 * re-injects it after decoding because the binary frame type is
 * implied by the WebSocket message being binary and longer than the
 * 40-byte position-update frame.
 */
export function encodeSnapshot(frame: VesselSnapshotFrame): Uint8Array {
  const payload = {
    serverTimeUnix: frame.serverTimeUnix,
    vessels: frame.vessels.map(entry => ({
      mmsi: entry.mmsi,
      staticData: entry.staticData ? encodeStaticDataPayload(entry.staticData) : undefined,
      history: entry.history.map((p: VesselHistoryPoint) => ({
        lng: p.lng,
        lat: p.lat,
        sog: p.sog ?? undefined,
        cog: p.cog ?? undefined,
        trueHeading: p.trueHeading ?? undefined,
        timestampUnix: p.timestampUnix,
      })),
      kalman: entry.kalman ? encodeKalmanPayload(entry.kalman) : undefined,
      sourceId: entry.sourceId ?? undefined,
    })),
  };
  const err = SnapshotFrameType.verify(payload);
  if (err) {
    throw new Error(`snapshot encode verify failed: ${err}`);
  }
  const message = SnapshotFrameType.create(payload);
  return withTypeMarker(BINARY_FRAME_TYPE_SNAPSHOT, SnapshotFrameType.encode(message).finish());
}

/**
 * Encode a single vessel static-data frame to a Protobuf wire buffer
 * with a leading type marker byte. Mirrors the per-vessel StaticData
 * schema used inside the snapshot so the wire stays compatible
 * between cold-start and live updates.
 */
export function encodeStaticFrame(frame: VesselStaticDataFrame): Uint8Array {
  const payload = encodeStaticDataPayload(frame);
  const err = StaticDataType.verify(payload);
  if (err) {
    throw new Error(`static encode verify failed: ${err}`);
  }
  const message = StaticDataType.create(payload);
  return withTypeMarker(BINARY_FRAME_TYPE_STATIC, StaticDataType.encode(message).finish());
}

/**
 * Decode a static-data wire buffer (without the leading type marker -
 * the dispatcher strips it before calling this) into the canonical
 * `VesselStaticDataFrame` shape, re-stamping the discriminator.
 */
export function decodeStaticFrame(buffer: Uint8Array): VesselStaticDataFrame {
  const payload =
    buffer.length > 0 && buffer[0] === BINARY_FRAME_TYPE_STATIC ? buffer.subarray(1) : buffer;
  const message = StaticDataType.decode(payload);
  const raw = StaticDataType.toObject(message, {
    longs: Number,
    defaults: false,
    arrays: true,
    objects: true,
  }) as RawStaticData;
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    ...decodeStaticDataPayload(raw),
  };
}

function withTypeMarker(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 1);
  out[0] = marker;
  out.set(payload, 1);
  return out;
}

/**
 * Decode a Protobuf wire buffer back to a snapshot frame. The buffer
 * comes off the WebSocket as `ArrayBuffer`; callers wrap it in
 * `Uint8Array` and strip the leading type marker before passing in.
 * The decoded object is re-stamped with `kind: VESSEL_SNAPSHOT_FRAME_KIND`
 * so downstream consumers keep the discriminated-union pattern they
 * used with JSON.
 */
export function decodeSnapshot(buffer: Uint8Array): VesselSnapshotFrame {
  // Tolerant of both shapes: with leading type marker (live wire) and
  // without (round-trip tests, anything that already stripped it).
  const payload =
    buffer.length > 0 && buffer[0] === BINARY_FRAME_TYPE_SNAPSHOT ? buffer.subarray(1) : buffer;
  const message = SnapshotFrameType.decode(payload);
  // toObject converts Long values to plain numbers when longs: Number,
  // and skips absent optional fields so we have to coalesce them back
  // to null on the consumer side of the conversion below.
  const obj = SnapshotFrameType.toObject(message, {
    longs: Number,
    defaults: false,
    arrays: true,
    objects: true,
  }) as RawSnapshotFrame;

  const vessels: VesselSnapshotEntry[] = obj.vessels.map(entry => ({
    mmsi: entry.mmsi as Mmsi,
    staticData: entry.staticData ? decodeStaticDataPayload(entry.staticData) : null,
    history: (entry.history ?? []).map(decodeHistoryPoint),
    kalman: entry.kalman ? decodeKalmanPayload(entry.kalman) : null,
    sourceId:
      entry.sourceId === undefined ? null : (entry.sourceId as VesselSnapshotEntry['sourceId']),
  }));

  return {
    kind: VESSEL_SNAPSHOT_FRAME_KIND,
    serverTimeUnix: obj.serverTimeUnix,
    vessels,
  };
}

type RawStaticData = {
  mmsi: number;
  vesselName: string;
  imo?: number;
  callSign: string;
  shipType: number;
  dimensions?: StaticDimensions;
  draught?: number;
  destination: string;
  eta: { month?: number; day?: number; hour?: number; minute?: number };
  receivedAt: number;
};

type RawHistoryPoint = {
  lng: number;
  lat: number;
  sog?: number;
  cog?: number;
  trueHeading?: number;
  timestampUnix: number;
};

type RawKalman = {
  lng: number;
  lat: number;
  vlng: number;
  vlat: number;
  covariance: number[];
  updatedAtUnix: number;
};

type RawSnapshotEntry = {
  mmsi: number;
  staticData?: RawStaticData;
  history?: RawHistoryPoint[];
  kalman?: RawKalman;
  sourceId?: number;
};

type RawSnapshotFrame = {
  serverTimeUnix: number;
  vessels: RawSnapshotEntry[];
};

function encodeStaticDataPayload(staticData: Omit<VesselStaticDataFrame, 'kind'>): RawStaticData {
  return {
    mmsi: staticData.mmsi,
    vesselName: staticData.vesselName,
    imo: staticData.imo ?? undefined,
    callSign: staticData.callSign,
    shipType: staticData.shipType,
    dimensions: staticData.dimensions ?? undefined,
    draught: staticData.draught ?? undefined,
    destination: staticData.destination,
    eta: {
      month: staticData.eta.month ?? undefined,
      day: staticData.eta.day ?? undefined,
      hour: staticData.eta.hour ?? undefined,
      minute: staticData.eta.minute ?? undefined,
    },
    receivedAt: staticData.receivedAt,
  };
}

function decodeStaticDataPayload(raw: RawStaticData): Omit<VesselStaticDataFrame, 'kind'> {
  // The raw object has bare numbers / strings; we re-cast to brand
  // types and re-introduce explicit nulls so the consumer sees the
  // same shape it saw when the snapshot was JSON.
  return {
    mmsi: raw.mmsi as Mmsi,
    vesselName: raw.vesselName,
    imo: raw.imo === undefined ? null : (raw.imo as Imo),
    callSign: raw.callSign,
    shipType: raw.shipType as ShipTypeCode,
    dimensions: raw.dimensions === undefined ? null : (raw.dimensions as StaticDimensions),
    draught: raw.draught ?? null,
    destination: raw.destination,
    eta: {
      month: raw.eta.month ?? null,
      day: raw.eta.day ?? null,
      hour: raw.eta.hour ?? null,
      minute: raw.eta.minute ?? null,
    } satisfies StaticEta,
    receivedAt: raw.receivedAt,
  };
}

function encodeKalmanPayload(kalman: VesselKalmanState): RawKalman {
  return {
    lng: kalman.lng,
    lat: kalman.lat,
    vlng: kalman.vlng,
    vlat: kalman.vlat,
    covariance: [...kalman.covariance],
    updatedAtUnix: kalman.updatedAtUnix,
  };
}

function decodeKalmanPayload(raw: RawKalman): VesselKalmanState {
  return {
    lng: raw.lng,
    lat: raw.lat,
    vlng: raw.vlng,
    vlat: raw.vlat,
    covariance: raw.covariance,
    updatedAtUnix: raw.updatedAtUnix,
  };
}

function decodeHistoryPoint(raw: RawHistoryPoint): VesselHistoryPoint {
  return {
    lng: raw.lng,
    lat: raw.lat,
    sog: raw.sog ?? null,
    cog: raw.cog ?? null,
    trueHeading: raw.trueHeading ?? null,
    timestampUnix: raw.timestampUnix,
  };
}
