import {
  VESSEL_FRAME_BYTES,
  VESSEL_STATIC_FRAME_KIND,
  type VesselStaticDataFrame,
  decodeVesselFrame,
} from '@sps/shared';
import type { LiveVessel } from './types';
import { setVesselStatic } from './vessel-static.store';
import { setVessel } from './vessels.store';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type TelemetryClientOptions = {
  readonly url?: string;
  readonly onVessel?: (vessel: LiveVessel) => void;
  readonly onStatic?: (frame: VesselStaticDataFrame) => void;
};

function isStaticFrame(candidate: unknown): candidate is VesselStaticDataFrame {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const frame = candidate as Record<string, unknown>;
  if (frame.kind !== VESSEL_STATIC_FRAME_KIND) return false;
  if (typeof frame.mmsi !== 'number' || !Number.isFinite(frame.mmsi)) return false;
  if (typeof frame.vesselName !== 'string') return false;
  if (typeof frame.callSign !== 'string') return false;
  if (typeof frame.destination !== 'string') return false;
  if (typeof frame.shipType !== 'number') return false;
  if (typeof frame.receivedAt !== 'number') return false;
  if (frame.imo !== null && (typeof frame.imo !== 'number' || !Number.isFinite(frame.imo))) {
    return false;
  }
  if (frame.draught !== null && typeof frame.draught !== 'number') return false;
  if (!isStaticEta(frame.eta)) return false;
  if (frame.dimensions !== null && !isStaticDimensions(frame.dimensions)) return false;
  return true;
}

function isStaticEta(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const eta = candidate as Record<string, unknown>;
  return (
    isNullableNumber(eta.month) &&
    isNullableNumber(eta.day) &&
    isNullableNumber(eta.hour) &&
    isNullableNumber(eta.minute)
  );
}

function isStaticDimensions(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const dimensions = candidate as Record<string, unknown>;
  return (
    typeof dimensions.toBow === 'number' &&
    typeof dimensions.toStern === 'number' &&
    typeof dimensions.toPort === 'number' &&
    typeof dimensions.toStarboard === 'number'
  );
}

function isNullableNumber(candidate: unknown): boolean {
  return candidate === null || typeof candidate === 'number';
}

export type DispatchHandlers = {
  readonly onVessel?: (vessel: LiveVessel) => void;
  readonly onStatic?: (frame: VesselStaticDataFrame) => void;
};

/**
 * Pure dispatch over the WebSocket message payload. Extracted so the
 * binary/text branching is testable without standing up a real socket.
 * Mutates `$vessels` / `$vesselStaticData` via their setters as a side
 * effect, then invokes the optional caller handlers.
 */
export function dispatchTelemetryMessage(data: unknown, handlers: DispatchHandlers = {}): void {
  if (data instanceof ArrayBuffer) {
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
      flags: frame.flags,
    };
    setVessel(vessel);
    handlers.onVessel?.(vessel);
    return;
  }
  if (typeof data === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      console.warn('[telemetry] malformed JSON text frame', err);
      return;
    }
    if (!isStaticFrame(parsed)) {
      console.warn('[telemetry] unrecognised JSON frame kind', parsed);
      return;
    }
    setVesselStatic(parsed);
    handlers.onStatic?.(parsed);
    return;
  }
  console.warn('[telemetry] unexpected message type; ignoring');
}

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
 * WebSocket consumer for /ws/telemetry. Two frame kinds reach the
 * client: binary VesselUpdateFrame (40 bytes) for high-frequency
 * position updates, and JSON text frames discriminated by `kind:
 * "vessel.static"` for ship-static metadata. Position decodes feed
 * `$vessels`, static decodes feed `$vesselStaticData`. Reconnects with
 * exponential backoff capped at 30s.
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
      dispatchTelemetryMessage(evt.data, {
        onVessel: options.onVessel,
        onStatic: options.onStatic,
      });
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
