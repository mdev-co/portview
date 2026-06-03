import { describe, expect, it } from 'vitest';
import { SourceId } from '../../types/brands';
import type { Imo, Mmsi, ShipTypeCode } from '../../types/brands';
import { VESSEL_SNAPSHOT_FRAME_KIND, type VesselSnapshotFrame } from '../../types/vessel-snapshot';
import { VESSEL_STATIC_FRAME_KIND, type VesselStaticDataFrame } from '../../types/vessel-static';
import {
  BINARY_FRAME_TYPE_SNAPSHOT,
  BINARY_FRAME_TYPE_STATIC,
  decodeSnapshot,
  decodeStaticFrame,
  encodeSnapshot,
  encodeStaticFrame,
} from '../snapshot.codec';

describe('snapshot.codec', () => {
  it('round-trips a full snapshot with one rich entry', () => {
    const frame: VesselSnapshotFrame = {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: 1_780_000_000,
      vessels: [
        {
          mmsi: 261_182_517 as Mmsi,
          staticData: {
            mmsi: 261_182_517 as Mmsi,
            vesselName: 'ROYAL HARBOR',
            imo: 9_876_543 as unknown as Imo,
            callSign: 'SQAB',
            shipType: 70 as unknown as ShipTypeCode,
            dimensions: { toBow: 80, toStern: 20, toPort: 12, toStarboard: 12 },
            draught: 6.4,
            destination: 'SZCZECIN',
            eta: { month: 6, day: 15, hour: 14, minute: 30 },
            receivedAt: 1_780_000_000_000,
          },
          history: [
            {
              lng: 14.57,
              lat: 53.42,
              sog: 5.4,
              cog: 91,
              trueHeading: 92,
              timestampUnix: 1_779_999_900,
            },
            {
              lng: 14.58,
              lat: 53.43,
              sog: null,
              cog: null,
              trueHeading: null,
              timestampUnix: 1_779_999_960,
            },
          ],
          kalman: {
            lng: 14.575,
            lat: 53.425,
            vlng: 0.00001,
            vlat: 0.000005,
            covariance: Array.from({ length: 16 }, (_, i) => i * 0.1),
            updatedAtUnix: 1_779_999_960,
          },
          sourceId: SourceId.EdgeBridge,
        },
      ],
    };

    const wire = encodeSnapshot(frame);
    expect(wire).toBeInstanceOf(Uint8Array);
    expect(wire.byteLength).toBeGreaterThan(0);

    const decoded = decodeSnapshot(wire);
    expect(decoded.kind).toBe(VESSEL_SNAPSHOT_FRAME_KIND);
    expect(decoded.serverTimeUnix).toBe(frame.serverTimeUnix);
    expect(decoded.vessels).toHaveLength(1);

    const [entry] = decoded.vessels;
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.mmsi).toBe(261_182_517);
    expect(entry.sourceId).toBe(SourceId.EdgeBridge);
    expect(entry.staticData).not.toBeNull();
    expect(entry.staticData?.vesselName).toBe('ROYAL HARBOR');
    expect(entry.staticData?.destination).toBe('SZCZECIN');
    expect(entry.staticData?.dimensions).toEqual({
      toBow: 80,
      toStern: 20,
      toPort: 12,
      toStarboard: 12,
    });
    expect(entry.history).toHaveLength(2);
    expect(entry.history[0]?.lng).toBeCloseTo(14.57, 5);
    expect(entry.history[1]?.sog).toBeNull();
    expect(entry.history[1]?.cog).toBeNull();
    expect(entry.history[1]?.trueHeading).toBeNull();
    expect(entry.kalman?.covariance).toHaveLength(16);
    expect(entry.kalman?.vlat).toBeCloseTo(0.000005, 9);
  });

  it('handles an entry with no static data, no kalman, no sourceId, empty history', () => {
    const frame: VesselSnapshotFrame = {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: 1_780_000_000,
      vessels: [
        {
          mmsi: 999_999_999 as Mmsi,
          staticData: null,
          history: [],
          kalman: null,
          sourceId: null,
        },
      ],
    };

    const wire = encodeSnapshot(frame);
    const decoded = decodeSnapshot(wire);

    expect(decoded.vessels).toHaveLength(1);
    const [entry] = decoded.vessels;
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.staticData).toBeNull();
    expect(entry.kalman).toBeNull();
    expect(entry.sourceId).toBeNull();
    expect(entry.history).toEqual([]);
  });

  it('prefixes the wire with the snapshot type marker byte', () => {
    const wire = encodeSnapshot({
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: 1_780_000_000,
      vessels: [],
    });
    expect(wire[0]).toBe(BINARY_FRAME_TYPE_SNAPSHOT);
  });

  it('round-trips a single vessel.static frame with type marker', () => {
    const frame: VesselStaticDataFrame = {
      kind: VESSEL_STATIC_FRAME_KIND,
      mmsi: 261_182_517 as Mmsi,
      vesselName: 'POMORZAK',
      imo: 9_876_543 as unknown as Imo,
      callSign: 'SPG5479',
      shipType: 37 as unknown as ShipTypeCode,
      dimensions: { toBow: 4, toStern: 7, toPort: 2, toStarboard: 1 },
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_780_000_000_000,
    };

    const wire = encodeStaticFrame(frame);
    expect(wire[0]).toBe(BINARY_FRAME_TYPE_STATIC);
    const decoded = decodeStaticFrame(wire);

    expect(decoded.kind).toBe(VESSEL_STATIC_FRAME_KIND);
    expect(decoded.mmsi).toBe(261_182_517);
    expect(decoded.vesselName).toBe('POMORZAK');
    expect(decoded.callSign).toBe('SPG5479');
    expect(decoded.dimensions).toEqual({ toBow: 4, toStern: 7, toPort: 2, toStarboard: 1 });
    expect(decoded.draught).toBeNull();
    expect(decoded.eta).toEqual({ month: null, day: null, hour: null, minute: null });
  });

  it('marker bytes are disjoint from the AIS messageType range so a position frame is never mistaken for a snapshot/static frame', () => {
    // AIS spec messageType range is 1..27 (bit-packed in the first
    // 6 bits of every message). The binary position-frame codec
    // writes that messageType directly at byte[0]. Marker bytes
    // therefore must NOT fall inside {1..27} - otherwise a
    // dispatcher inspecting byte[0] would route a real position
    // frame whose messageType happens to equal the marker to the
    // wrong decoder. 0xFE (254) and 0xFF (255) sit well outside the
    // range and guarantee disjointness.
    const AIS_MAX_MESSAGE_TYPE = 27;
    expect(BINARY_FRAME_TYPE_SNAPSHOT).toBeGreaterThan(AIS_MAX_MESSAGE_TYPE);
    expect(BINARY_FRAME_TYPE_STATIC).toBeGreaterThan(AIS_MAX_MESSAGE_TYPE);
    expect(BINARY_FRAME_TYPE_SNAPSHOT).not.toBe(BINARY_FRAME_TYPE_STATIC);
  });

  it('encoded snapshot and static frames always carry their marker as the first byte (regression: dispatcher must route by marker, not length)', () => {
    // A 1-vessel 1-history-point snapshot encodes to exactly 40
    // bytes - the same length as the position frame. Before the
    // marker-byte change, a length-first dispatcher misrouted that
    // snapshot to the position decoder. The marker must always be
    // at byte[0] so the dispatcher can route correctly regardless
    // of the body length collision.
    const snapshot: VesselSnapshotFrame = {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: 1_780_000_000,
      vessels: [
        {
          mmsi: 261_182_517 as Mmsi,
          staticData: null,
          history: [
            {
              lng: 14.5,
              lat: 53.4,
              sog: null,
              cog: null,
              trueHeading: null,
              timestampUnix: 1_780_000_000,
            },
          ],
          kalman: null,
          sourceId: null,
        },
      ],
    };
    const encoded = encodeSnapshot(snapshot);
    expect(encoded[0]).toBe(BINARY_FRAME_TYPE_SNAPSHOT);

    const staticFrame: VesselStaticDataFrame = {
      kind: VESSEL_STATIC_FRAME_KIND,
      mmsi: 261_182_517 as Mmsi,
      vesselName: 'X',
      imo: null,
      callSign: '',
      shipType: 0 as unknown as ShipTypeCode,
      dimensions: null,
      draught: null,
      destination: '',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: 1_780_000_000,
    };
    const encodedStatic = encodeStaticFrame(staticFrame);
    expect(encodedStatic[0]).toBe(BINARY_FRAME_TYPE_STATIC);
  });

  it('shrinks the wire payload compared to JSON.stringify', () => {
    const vessels = Array.from({ length: 50 }, (_, i) => ({
      mmsi: (261_000_000 + i) as Mmsi,
      staticData: null,
      history: [
        {
          lng: 14.5 + i * 0.001,
          lat: 53.4 + i * 0.001,
          sog: 5,
          cog: 90,
          trueHeading: 90,
          timestampUnix: 1_780_000_000 - i * 60,
        },
      ],
      kalman: null,
      sourceId: SourceId.EdgeBridge,
    }));
    const frame: VesselSnapshotFrame = {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: 1_780_000_000,
      vessels,
    };

    const json = JSON.stringify(frame);
    const protobuf = encodeSnapshot(frame);

    expect(protobuf.byteLength).toBeLessThan(json.length);
  });
});
