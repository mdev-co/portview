import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Imo,
  type Mmsi,
  type ShipTypeCode,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FRAME_BYTES,
  VESSEL_SNAPSHOT_FRAME_KIND,
  VESSEL_STATIC_FRAME_KIND,
  type VesselSnapshotFrame,
  type VesselStaticDataFrame,
  type VesselUpdateFrame,
  encodeVesselFrame,
} from '@sps/shared';
import { dispatchTelemetryMessage } from '../telemetry-client';
import { $vesselPositionHistory } from '../vessel-history.store';
import { $vesselStaticData } from '../vessel-static.store';
import { $vessels, __test as vesselsTest } from '../vessels.store';

const POSITION_FRAME: VesselUpdateFrame = {
  messageType: 1,
  mmsi: 261_345_678 as Mmsi,
  sourceId: SourceId.AisStream,
  navStatus: 0,
  rateOfTurn: null,
  lng: 14.5528,
  lat: 53.4285,
  sog: 12.3,
  cog: 217.4,
  trueHeading: 215,
  timestampUnix: 1_715_000_000,
  flags: VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_HAS_IDENTITY,
  reserved: 0,
};

const VALID_STATIC: VesselStaticDataFrame = {
  kind: VESSEL_STATIC_FRAME_KIND,
  mmsi: 261_345_678 as Mmsi,
  vesselName: 'TRIESTE',
  imo: 9_725_634 as Imo,
  callSign: 'SXFG',
  shipType: 70 as ShipTypeCode,
  dimensions: { toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 },
  draught: 7.4,
  destination: 'GDYNIA',
  eta: { month: 5, day: 12, hour: 14, minute: 30 },
  receivedAt: 1_715_000_000_000,
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  $vessels.set({});
  $vesselStaticData.set({});
  $vesselPositionHistory.set({});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('dispatchTelemetryMessage - binary path', () => {
  it('decodes a binary frame of the expected length and updates $vessels', () => {
    const buf = encodeVesselFrame(POSITION_FRAME).buffer as ArrayBuffer;
    const onVessel = vi.fn();

    dispatchTelemetryMessage(buf, { onVessel });

    const stored = $vessels.get()[POSITION_FRAME.mmsi];
    expect(stored).toBeDefined();
    expect(stored?.lng).toBeCloseTo(POSITION_FRAME.lng!, 4);
    expect(onVessel).toHaveBeenCalledTimes(1);
  });

  it('skips a binary frame whose length does not match the codec contract', () => {
    const onVessel = vi.fn();

    dispatchTelemetryMessage(new ArrayBuffer(VESSEL_FRAME_BYTES - 1), { onVessel });

    expect(onVessel).not.toHaveBeenCalled();
    expect($vessels.get()).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      '[telemetry] unexpected frame length',
      expect.objectContaining({ expected: VESSEL_FRAME_BYTES }),
    );
  });
});

describe('dispatchTelemetryMessage - text path', () => {
  it('parses a valid static-data envelope and writes it into $vesselStaticData', () => {
    const onStatic = vi.fn();

    dispatchTelemetryMessage(JSON.stringify(VALID_STATIC), { onStatic });

    expect($vesselStaticData.get()[VALID_STATIC.mmsi]).toEqual(VALID_STATIC);
    expect(onStatic).toHaveBeenCalledWith(VALID_STATIC);
  });

  it('skips malformed JSON without throwing', () => {
    const onStatic = vi.fn();

    expect(() => dispatchTelemetryMessage('not-json', { onStatic })).not.toThrow();
    expect(onStatic).not.toHaveBeenCalled();
    expect($vesselStaticData.get()).toEqual({});
  });

  it('skips a JSON frame whose kind discriminator is unknown', () => {
    const onStatic = vi.fn();
    const payload = JSON.stringify({ ...VALID_STATIC, kind: 'something.else' });

    dispatchTelemetryMessage(payload, { onStatic });

    expect(onStatic).not.toHaveBeenCalled();
    expect($vesselStaticData.get()).toEqual({});
  });

  it('rejects a static envelope where required fields have the wrong type', () => {
    const onStatic = vi.fn();
    const payload = JSON.stringify({
      ...VALID_STATIC,
      vesselName: 12, // expected string per the wire contract
    });

    dispatchTelemetryMessage(payload, { onStatic });

    expect(onStatic).not.toHaveBeenCalled();
    expect($vesselStaticData.get()).toEqual({});
  });

  it('rejects a static envelope whose eta sub-object is malformed', () => {
    const onStatic = vi.fn();
    const payload = JSON.stringify({
      ...VALID_STATIC,
      eta: { month: 'maj' },
    });

    dispatchTelemetryMessage(payload, { onStatic });

    expect(onStatic).not.toHaveBeenCalled();
  });
});

describe('dispatchTelemetryMessage - unexpected payload', () => {
  it('warns and returns when the payload is neither ArrayBuffer nor string', () => {
    dispatchTelemetryMessage({ not: 'expected' });

    expect(warnSpy).toHaveBeenCalledWith('[telemetry] unexpected message type; ignoring');
  });
});

describe('dispatchTelemetryMessage - snapshot path', () => {
  // The user-reported "sidebar empties, ghost shape lingers on the map"
  // bug came from synthesising a LiveVessel with the latest history
  // point's timestampUnix. AisStream's free tier sub samples reports
  // so the freshest history sample can easily be 4-5 minutes old at
  // load time. The vessels.store TTL sweep (>600 s) then evicts the
  // synthetic entry on the very next pass while the trail polyline
  // (history-driven, separate sweep) lingers, hence the desync.
  //
  // After the fix the synthetic vessel is stamped with
  // `frame.serverTimeUnix`, which is the server-side clock at the
  // moment the snapshot was emitted: vessels survive the immediate
  // sweep and age out only after a real 600 s of silence on the live
  // feed.

  const SERVER_TIME_UNIX = 1_715_001_000; // "now" at snapshot emit
  const HISTORY_POINT_AGE_S = 400; // older than freshness window

  function makeSnapshot(overrides: Partial<VesselSnapshotFrame> = {}): VesselSnapshotFrame {
    return {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: SERVER_TIME_UNIX,
      vessels: [
        {
          mmsi: 261_111_111 as Mmsi,
          staticData: null,
          history: [
            {
              lng: 14.55,
              lat: 53.42,
              sog: 5.2,
              cog: 90,
              trueHeading: 90,
              timestampUnix: SERVER_TIME_UNIX - HISTORY_POINT_AGE_S,
            },
          ],
          kalman: null,
          sourceId: null,
        },
      ],
      ...overrides,
    };
  }

  it('stamps synthetic vessels with the snapshot server time, not the history point time', () => {
    dispatchTelemetryMessage(JSON.stringify(makeSnapshot()));

    const stored = $vessels.get()[261_111_111];
    expect(stored).toBeDefined();
    expect(stored?.timestampUnix).toBe(SERVER_TIME_UNIX);
    expect(stored?.timestampUnix).not.toBe(SERVER_TIME_UNIX - HISTORY_POINT_AGE_S);
    // Position fields still come from the history point so dead reckoning
    // and trail rendering have something to interpolate from.
    expect(stored?.lng).toBeCloseTo(14.55, 4);
    expect(stored?.lat).toBeCloseTo(53.42, 4);
  });

  it('keeps the synthetic vessel alive through an immediate TTL sweep', () => {
    dispatchTelemetryMessage(JSON.stringify(makeSnapshot()));
    // Sweep at "snapshot + 5 s". Even though the history point itself
    // is 400 s old (would otherwise trip the > 600 s threshold once we
    // reach SERVER_TIME_UNIX + 200 s real time), the vessel is stamped
    // with the snapshot time so the sweep keeps it.
    vesselsTest.sweepStale(SERVER_TIME_UNIX + 5);
    expect($vessels.get()[261_111_111]).toBeDefined();
  });

  it('skips synthesising a LiveVessel for an entry with empty history', () => {
    const frame = makeSnapshot({
      vessels: [
        {
          mmsi: 261_222_222 as Mmsi,
          staticData: null,
          history: [],
          kalman: null,
          sourceId: null,
        },
      ],
    });

    dispatchTelemetryMessage(JSON.stringify(frame));

    expect($vessels.get()[261_222_222]).toBeUndefined();
  });
});
