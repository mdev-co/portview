import {
  type AisMessage,
  SourceId,
  VESSEL_FRAME_BYTES,
  decodeVesselFrame,
} from '@sps/shared';
import { WebSocket } from 'ws';
import type { VesselUpdateEvent } from '../ingest/ingest.events';
import { TelemetryWsGateway } from './telemetry-ws.gateway';

type FakeClient = {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock<void, [Buffer | Uint8Array, { binary: boolean }]>;
};

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const send = jest.fn<void, [Buffer | Uint8Array, { binary: boolean }]>();
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
  mmsi: 261_345_678,
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
    gateway = new TelemetryWsGateway();
    clients = new Set();
    // server is `WebSocketServer` which exposes a `clients` Set; we
    // only read that Set in the handler so a minimal stand-in is enough.
    (gateway as unknown as { server: { clients: Set<FakeClient> } }).server = {
      clients,
    };
  });

  it('encodes a 38-byte binary frame and broadcasts to every open client', () => {
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
    expect(frameA.byteLength).toBe(VESSEL_FRAME_BYTES);

    // Round-trip the broadcast frame through the codec to verify content.
    const decoded = decodeVesselFrame(frameA as Uint8Array);
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
