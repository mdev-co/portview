import { $vessels } from '@/modules/telemetry/vessels.store';
import {
  DEFAULT_DWELL_CONFIG,
  type GeofenceEvent,
  type Mmsi,
  type VesselPositionFrame,
  type ZoneCollection,
  type ZoneId,
  computePresence,
  forceExitVessel,
  sweepGhosts,
  tickGeofence,
} from '@sps/shared';
import { appendGeofenceEvents } from './geofence-events.store';
import {
  $geofenceMembership,
  $geofencePresence,
  setMembershipState,
  setVesselPresence,
} from './geofence-membership.store';
import { $geofenceZones } from './geofence-zones.atom';

/**
 * Cadence of the ghost-sweep timer. Picked an order of magnitude
 * shorter than the ghost timeout (10 min) so a vanished vessel is
 * surfaced via a synthesised Exit within roughly one minute of the
 * deadline elapsing. Negligible cost - one Map iteration per tick.
 */
const GHOST_SWEEP_INTERVAL_MS = 60_000;

let unsubscribe: (() => void) | null = null;
let sweepHandle: ReturnType<typeof setInterval> | null = null;
let previousVesselIds: Set<Mmsi> = new Set();

/**
 * Wire the vessels store and the ghost watchdog to the dwell-time
 * machine. Idempotent: a second `startGeofencePipeline` invocation
 * is a no-op so route re-mounts (the lazy MapView Suspense
 * boundary) do not duplicate listeners.
 *
 * Side effects established:
 *   - `$vessels` changes drive `tickGeofence` per affected vessel.
 *   - Vessels evicted from `$vessels` (TTL sweep) trigger
 *     `forceExitVessel`, timestamped from each vessel's last seen
 *     frame so the synthesised Exit stays replay-deterministic.
 *   - A 60 s interval calls `sweepGhosts` so vessels that quietly
 *     stop broadcasting WHILE the eviction sweep has not yet
 *     deleted them still surface as `ghost-exit` events.
 *
 * Stopping is symmetric: `stopGeofencePipeline` is exposed for
 * tests and the React Strict-Mode double-effect guard.
 */
export function startGeofencePipeline(): void {
  if (unsubscribe !== null) return;

  previousVesselIds = collectVesselIds($vessels.get());

  unsubscribe = $vessels.subscribe(snapshot => {
    const zones = $geofenceZones.get().features;
    if (zones.length === 0) {
      previousVesselIds = collectVesselIds(snapshot);
      return;
    }

    let state = $geofenceMembership.get();
    const collected: GeofenceEvent[] = [];

    // Pass 1: handle live updates per vessel currently in the store.
    const currentIds = new Set<Mmsi>();
    for (const key in snapshot) {
      const vessel = snapshot[key];
      if (vessel === undefined) continue;
      currentIds.add(vessel.mmsi);
      if (vessel.lng === null || vessel.lat === null) continue;
      const frame: VesselPositionFrame = {
        mmsi: vessel.mmsi,
        lng: vessel.lng,
        lat: vessel.lat,
        // FSM time-as-data: drive the dwell clock from the AIS
        // frame timestamp (seconds since epoch) converted to ms so
        // it lines up with our ghost timeout and tick math.
        timestampUnix: vessel.timestampUnix * 1_000,
      };
      const result = tickGeofence(state, frame, zones, frame.timestampUnix);
      state = result.state;
      collected.push(...result.events);
    }

    // Pass 2: handle vessels that disappeared since the previous
    // snapshot. The TTL sweeper inside vessels.store deletes
    // entries by replacing the whole store; we diff identifiers
    // and emit forced exits for the missing ones. The eviction
    // timestamp is derived from the missing vessel's last seen
    // frame across all of its remaining membership entries so
    // replay determinism holds for the synthesised Exit too.
    for (const previousId of previousVesselIds) {
      if (currentIds.has(previousId)) continue;
      const evictionNow = lastSeenFor(state, previousId) ?? Date.now();
      const result = forceExitVessel(state, previousId, evictionNow);
      state = result.state;
      collected.push(...result.events);
    }
    previousVesselIds = currentIds;

    setMembershipState(state);
    if (collected.length > 0) appendGeofenceEvents(collected);
    syncPresence(state);
  });

  sweepHandle = setInterval(() => {
    const state = $geofenceMembership.get();
    if (state.size === 0) return;
    const result = sweepGhosts(state, Date.now(), DEFAULT_DWELL_CONFIG);
    setMembershipState(result.state);
    if (result.events.length > 0) appendGeofenceEvents(result.events);
    syncPresence(result.state);
  }, GHOST_SWEEP_INTERVAL_MS);
}

/** Tear down listeners; only the app shell unmount / tests need this. */
export function stopGeofencePipeline(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (sweepHandle !== null) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
  previousVesselIds = new Set();
  lastPresenceSnapshot = new Map();
}

/**
 * Diff the latest membership state against the previous presence
 * snapshot and write `$geofencePresence` per-key only for vessels
 * whose confirmed-zone set actually changed. This keeps the
 * sidebar badge (one subscriber per vessel) re-render fan-out
 * bounded to the few vessels that crossed a boundary this tick,
 * not the entire fleet on every AIS frame.
 */
let lastPresenceSnapshot: Map<Mmsi, ReadonlySet<ZoneId>> = new Map();

function syncPresence(state: ReturnType<typeof $geofenceMembership.get>): void {
  const next = computePresence(state);
  const seen = new Set<Mmsi>();
  for (const [mmsi, zones] of next) {
    seen.add(mmsi);
    const prev = lastPresenceSnapshot.get(mmsi);
    if (prev !== undefined && setsEqual(prev, zones)) continue;
    setVesselPresence(mmsi, Array.from(zones));
  }
  // Vessels that had presence last tick but not this tick - clear them.
  for (const mmsi of lastPresenceSnapshot.keys()) {
    if (seen.has(mmsi)) continue;
    setVesselPresence(mmsi, []);
  }
  lastPresenceSnapshot = next as Map<Mmsi, ReadonlySet<ZoneId>>;
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function collectVesselIds(snapshot: Record<string, { mmsi: Mmsi } | undefined>): Set<Mmsi> {
  const ids = new Set<Mmsi>();
  for (const key in snapshot) {
    const vessel = snapshot[key];
    if (vessel === undefined) continue;
    ids.add(vessel.mmsi);
  }
  return ids;
}

/**
 * Return the largest `lastSeenAt` across every membership entry
 * for the given vessel, or `null` if it has no entries. Used to
 * timestamp eviction-synthesised Exits with the most recent real
 * frame timestamp instead of wall-clock, preserving the
 * replay-determinism property the ADR documents.
 */
function lastSeenFor(state: ReturnType<typeof $geofenceMembership.get>, mmsi: Mmsi): number | null {
  let best: number | null = null;
  const mmsiPrefix = `${mmsi}|`;
  for (const [key, entry] of state) {
    if (!key.startsWith(mmsiPrefix)) continue;
    if (best === null || entry.lastSeenAt > best) best = entry.lastSeenAt;
  }
  return best;
}

/** Test-only access to internal state for assertions. */
export const __test = {
  resetPipelineState: (): void => {
    previousVesselIds = new Set();
    lastPresenceSnapshot = new Map();
  },
};

export { $geofencePresence };
export type { ZoneCollection };
