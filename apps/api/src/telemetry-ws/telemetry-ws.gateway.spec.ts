import {
  type AisMessage,
  BINARY_FRAME_TYPE_STATIC,
  type Imo,
  type Mmsi,
  type ShipTypeCode,
  SourceId,
  type StaticData,
  VESSEL_FRAME_BYTES,
  VESSEL_STATIC_FRAME_KIND,
  decodeStaticFrame,
  decodeVesselFrame,
} from '@sps/shared';
import { WebSocket } from 'ws';
import type {
  VesselStaticEvent,
  VesselUpdateEvent,
} from '../ingest/ingest.events';
import { TelemetryWsGateway } from './telemetry-ws.gateway';

type FakeClient = {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock<void, [Buffer | Uint8Array | string, { binary: boolean }]>;
};

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const send = jest.fn<
    void,
    [Buffer | Uint8Array | string, { binary: boolean }]
  >();
  return {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send,
    ...overrides,
  };
}

const POSITION: AisMessage = {
  messageType: 1,
  repeatIndicator: 0,
  mmsi: 261_345_678 as Mmsi,
  navigationStatus: 0,
  rateOfTurn: null,
  speedOverGround: 10,
  positionAccuracy: false,
  position: [14.5, 53.4],
  courseOverGround: 90,
  trueHeading: 91,
  timestamp: null,
  maneuverIndicator: 0,
  raim: false,
  radioStatus: 0,
};

function makeEvent(
  overrides: Partial<VesselUpdateEvent> = {},
): VesselUpdateEvent {
  return {
    message: POSITION,
    sourceId: SourceId.LocalUdp,
    receivedAt: 1_715_000_000_000,
    ...overrides,
  };
}

describe('TelemetryWsGateway.onVesselUpdate', () => {
  let gateway: TelemetryWsGateway;
  let clients: Set<FakeClient>;

  beforeEach(() => {
    gateway = new TelemetryWsGateway({
      build: () =>
        Promise.resolve({
          kind: 'vessel.snapshot',
          serverTimeUnix: 0,
          vessels: [],
        }),
    } as unknown as ConstructorParameters<typeof TelemetryWsGateway>[0]);
    clients = new Set();
    // server is `WebSocketServer` which exposes a `clients` Set; we
    // only read that Set in the handler so a minimal stand-in is enough.
    (gateway as unknown as { server: { clients: Set<FakeClient> } }).server = {
      clients,
    };
  });

  it('encodes a binary frame of VESSEL_FRAME_BYTES and broadcasts to every open client', () => {
    const a = makeClient();
    const b = makeClient();
    clients.add(a);
    clients.add(b);

    gateway.onVesselUpdate(makeEvent());

    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledTimes(1);
    const [frameA, optsA] = a.send.mock.calls[0];
    expect(optsA).toEqual({ binary: true });
    expect(frameA).toBeInstanceOf(Uint8Array);
    const bytes = frameA as Uint8Array;
    expect(bytes.byteLength).toBe(VESSEL_FRAME_BYTES);

    // Round-trip the broadcast frame through the codec to verify content.
    const decoded = decodeVesselFrame(bytes);
    expect(decoded.mmsi).toBe(POSITION.mmsi);
    expect(decoded.messageType).toBe(POSITION.messageType);
  });

  it('skips clients whose readyState is not OPEN', () => {
    const open = makeClient();
    const connecting = makeClient({ readyState: WebSocket.CONNECTING });
    const closing = makeClient({ readyState: WebSocket.CLOSING });
    clients.add(open);
    clients.add(connecting);
    clients.add(closing);

    gateway.onVesselUpdate(makeEvent());

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(connecting.send).not.toHaveBeenCalled();
    expect(closing.send).not.toHaveBeenCalled();
  });

  it('skips clients whose bufferedAmount exceeds the backpressure cap', () => {
    const fast = makeClient();
    const slow = makeClient({ bufferedAmount: 5_000_000 });
    clients.add(fast);
    clients.add(slow);

    gateway.onVesselUpdate(makeEvent());

    expect(fast.send).toHaveBeenCalledTimes(1);
    expect(slow.send).not.toHaveBeenCalled();
  });

  it('does not throw when there are zero clients', () => {
    expect(() => gateway.onVesselUpdate(makeEvent())).not.toThrow();
  });
});

const STATIC_MESSAGE: StaticData = {
  messageType: 5,
  repeatIndicator: 0,
  mmsi: 261_345_678 as Mmsi,
  aisVersion: 0,
  imo: 9_725_634 as Imo,
  callSign: 'SXFG',
  vesselName: 'TRIESTE',
  shipType: 70 as ShipTypeCode,
  dimensions: { toBow: 100, toStern: 80, toPort: 14, toStarboard: 14 },
  epfdType: 0,
  eta: { month: 5, day: 12, hour: 14, minute: 30 },
  draught: 7.4,
  destination: 'GDYNIA',
  dte: false,
};

function makeStaticEvent(
  overrides: Partial<VesselStaticEvent> = {},
): VesselStaticEvent {
  return {
    message: STATIC_MESSAGE,
    sourceId: SourceId.AisStream,
    receivedAt: 1_715_000_000_000,
    ...overrides,
  };
}

describe('TelemetryWsGateway.onVesselStatic', () => {
  let gateway: TelemetryWsGateway;
  let clients: Set<FakeClient>;

  beforeEach(() => {
    gateway = new TelemetryWsGateway({
      build: () =>
        Promise.resolve({
          kind: 'vessel.snapshot',
          serverTimeUnix: 0,
          vessels: [],
        }),
    } as unknown as ConstructorParameters<typeof TelemetryWsGateway>[0]);
    clients = new Set();
    (gateway as unknown as { server: { clients: Set<FakeClient> } }).server = {
      clients,
    };
  });

  it('encodes vessel.static as a Protobuf binary frame with the static type marker', () => {
    const a = makeClient();
    clients.add(a);

    gateway.onVesselStatic(makeStaticEvent());

    expect(a.send).toHaveBeenCalledTimes(1);
    const [payload, opts] = a.send.mock.calls[0];
    expect(opts).toEqual({ binary: true });
    expect(payload).toBeInstanceOf(Uint8Array);
    const bytes = payload as Uint8Array;
    expect(bytes[0]).toBe(BINARY_FRAME_TYPE_STATIC);
    const decoded = decodeStaticFrame(bytes);
    expect(decoded.kind).toBe(VESSEL_STATIC_FRAME_KIND);
    expect(decoded.mmsi).toBe(STATIC_MESSAGE.mmsi);
    expect(decoded.vesselName).toBe(STATIC_MESSAGE.vesselName);
    expect(decoded.imo).toBe(STATIC_MESSAGE.imo);
    expect(decoded.shipType).toBe(STATIC_MESSAGE.shipType);
  });

  it('respects backpressure: skips slow clients on static frames too', () => {
    const fast = makeClient();
    const slow = makeClient({ bufferedAmount: 5_000_000 });
    clients.add(fast);
    clients.add(slow);

    gateway.onVesselStatic(makeStaticEvent());

    expect(fast.send).toHaveBeenCalledTimes(1);
    expect(slow.send).not.toHaveBeenCalled();
  });
});
