import { VESSEL_FRAME_BYTES, decodeVesselFrame } from '@sps/shared';
import type { LiveVessel } from './types';
import { setVessel } from './vessels.store';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type TelemetryClientOptions = {
  readonly url?: string;
  readonly onVessel?: (vessel: LiveVessel) => void;
};

export type TelemetryClient = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly status: () => 'idle' | 'connecting' | 'open' | 'closed';
};

function defaultUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws/telemetry';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host.includes(':5173') ? 'localhost:3000' : window.location.host;
  return `${proto}://${host}/ws/telemetry`;
}

/**
 * WebSocket consumer that decodes the API's binary VesselUpdateFrames
 * into LiveVessel records and pushes them into the $vessels Nano Store.
 *
 * Reconnects with exponential backoff capped at 30 s. Treats every
 * non-binary message as a protocol violation and logs a warning; in
 * practice the server never emits text frames, but this guards against
 * a future protocol upgrade slipping past.
 *
 * `onVessel` callback runs after the store is updated; commit #4 wires
 * this to a console.log for the D5 acceptance check.
 */
export function createTelemetryClient(options: TelemetryClientOptions = {}): TelemetryClient {
  const url = options.url ?? defaultUrl();
  let socket: WebSocket | null = null;
  let backoffMs = RECONNECT_BASE_MS;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let state: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';

  function scheduleReconnect(): void {
    if (stopped) return;
    state = 'closed';
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      open();
    }, backoffMs);
  }

  function open(): void {
    if (stopped) return;
    state = 'connecting';
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      state = 'open';
      backoffMs = RECONNECT_BASE_MS;

      console.warn('[telemetry] connected', { url });
    });

    ws.addEventListener('message', evt => {
      const data = evt.data;
      if (!(data instanceof ArrayBuffer)) {
        console.warn('[telemetry] non-binary message received; ignoring');
        return;
      }
      if (data.byteLength !== VESSEL_FRAME_BYTES) {
        console.warn('[telemetry] unexpected frame length', {
          expected: VESSEL_FRAME_BYTES,
          got: data.byteLength,
        });
        return;
      }
      const frame = decodeVesselFrame(new Uint8Array(data));
      const vessel: LiveVessel = {
        mmsi: frame.mmsi,
        messageType: frame.messageType,
        navStatus: frame.navStatus,
        sourceId: frame.sourceId,
        rateOfTurn: frame.rateOfTurn,
        lng: frame.lng,
        lat: frame.lat,
        sog: frame.sog,
        cog: frame.cog,
        trueHeading: frame.trueHeading,
        timestampUnix: frame.timestampUnix,
      };
      setVessel(vessel);
      options.onVessel?.(vessel);
    });

    ws.addEventListener('close', () => {
      socket = null;
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // No-op; close handler will fire and trigger the reconnect.
    });

    socket = ws;
  }

  return {
    start(): void {
      if (state !== 'idle' && state !== 'closed') return;
      stopped = false;
      open();
    },
    stop(): void {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket !== null) {
        socket.close(1000, 'client stop');
        socket = null;
      }
      state = 'idle';
    },
    status(): 'idle' | 'connecting' | 'open' | 'closed' {
      return state;
    },
  };
}
