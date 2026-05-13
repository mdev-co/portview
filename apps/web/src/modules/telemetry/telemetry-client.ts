import {
  type Mmsi,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_FRAME_BYTES,
  VESSEL_SNAPSHOT_FRAME_KIND,
  VESSEL_STATIC_FRAME_KIND,
  type VesselHistoryPoint,
  type VesselSnapshotFrame,
  type VesselStaticDataFrame,
  decodeVesselFrame,
} from '@sps/shared';
import type { LiveVessel } from './types';
import { appendHistoryPoint, setHistoryFromSnapshot, setKalmanState } from './vessel-history.store';
import { setVesselStatic } from './vessel-static.store';
import { setVessel } from './vessels.store';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type TelemetryClientOptions = {
  readonly url?: string;
  readonly onVessel?: (vessel: LiveVessel) => void;
  readonly onStatic?: (frame: VesselStaticDataFrame) => void;
  readonly onSnapshot?: (frame: VesselSnapshotFrame) => void;
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

function isSnapshotFrame(candidate: unknown): candidate is VesselSnapshotFrame {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const frame = candidate as Record<string, unknown>;
  if (frame.kind !== VESSEL_SNAPSHOT_FRAME_KIND) return false;
  if (typeof frame.serverTimeUnix !== 'number') return false;
  if (!Array.isArray(frame.vessels)) return false;
  // Trust the shape per-entry; the gateway is the only producer and a
  // malformed entry merely loses one vessel from the cold-start view.
  return true;
}

export type DispatchHandlers = {
  readonly onVessel?: (vessel: LiveVessel) => void;
  readonly onStatic?: (frame: VesselStaticDataFrame) => void;
  readonly onSnapshot?: (frame: VesselSnapshotFrame) => void;
};

/**
 * Apply a snapshot frame to the local stores. For each entry: seed the
 * static-data cache, replace the history buffer, install the Kalman
 * state, and synthesise a LiveVessel from the last history point so
 * the sidebar and map render immediately, before any live AIS report.
 *
 * The synthesised LiveVessel is stamped with `frame.serverTimeUnix`,
 * not the original history point timestamp - the snapshot is the
 * server saying "as of now (serverTimeUnix), the last known position
 * for this vessel is `latest`". Stamping with the older history
 * timestamp would mean the vessels.store TTL sweep evicts everything
 * on the very next pass whenever the freshest history sample is
 * older than the 600 s window, which produced the visible "sidebar
 * empties while a polyline lingers on the map" desync.
 */
function applySnapshot(frame: VesselSnapshotFrame): void {
  for (const entry of frame.vessels) {
    if (entry.staticData !== null) {
      setVesselStatic({
        kind: VESSEL_STATIC_FRAME_KIND,
        ...entry.staticData,
      });
    }
    setHistoryFromSnapshot(entry.mmsi, entry.history);
    if (entry.kalman !== null) {
      setKalmanState(entry.mmsi, entry.kalman);
    }
    const latest = entry.history[entry.history.length - 1];
    if (latest !== undefined) {
      setVessel(synthesiseLiveVesselFromHistory(entry.mmsi, latest, frame.serverTimeUnix));
    }
  }
}

function synthesiseLiveVesselFromHistory(
  mmsi: Mmsi,
  point: VesselHistoryPoint,
  serverTimeUnix: number,
): LiveVessel {
  // Snapshots originate from the same server that emits live frames,
  // so we know the vessel had a position fix at the recorded time.
  // Approximate the flags the next live frame would carry: HAS_FIX
  // always, IS_MOVING if SOG above the 0.5 kn threshold, HAS_IDENTITY
  // pessimistically off (the next live frame or static refresh will
  // refine).
  let flags = VESSEL_FLAG_HAS_FIX;
  if (point.sog !== null && point.sog > 0.5) {
    flags |= VESSEL_FLAG_IS_MOVING;
  }
  flags |= VESSEL_FLAG_HAS_IDENTITY;
  return {
    mmsi,
    messageType: 1,
    navStatus: null,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: point.lng,
    lat: point.lat,
    sog: point.sog,
    cog: point.cog,
    trueHeading: point.trueHeading,
    timestampUnix: serverTimeUnix,
    flags,
  };
}

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
    // Live position frames append to the rolling history buffer used
    // for trail rendering and smoothed dead-reckoning. Static-only
    // frames (handled below) have no position to append.
    if (vessel.lng !== null && vessel.lat !== null) {
      appendHistoryPoint(vessel.mmsi, {
        lng: vessel.lng,
        lat: vessel.lat,
        sog: vessel.sog,
        cog: vessel.cog,
        trueHeading: vessel.trueHeading,
        timestampUnix: vessel.timestampUnix,
      });
    }
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
    if (isSnapshotFrame(parsed)) {
      applySnapshot(parsed);
      handlers.onSnapshot?.(parsed);
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
  // Explicit override takes precedence. Vite inlines VITE_WS_URL at
  // build time, so production builds hosted at one origin (Vercel)
  // can point at an api hosted at a different origin (Fly). Without
  // this, the WebSocket falls through to window.location.host which
  // resolves to the static-hosting origin and has no ws upgrade route.
  const explicit = import.meta.env.VITE_WS_URL;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }
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
        onSnapshot: options.onSnapshot,
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
