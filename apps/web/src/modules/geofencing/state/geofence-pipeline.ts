import { $vessels, type LiveVessel } from '@/modules/telemetry';
import {
  DEFAULT_DWELL_CONFIG,
  type Mmsi,
  type VesselPositionFrame,
  type Zone,
  type ZoneCollection,
  type ZoneId,
  forceExitVessel,
  parseMembershipKey,
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

/**
 * Module-singleton holding the active pipeline instance, or null
 * when nothing is running. All actual pipeline state lives inside
 * the instance closure - this is the ONLY module-level variable so
 * HMR module replacement and Vitest module caching can not leak
 * stale subscription state across reloads / tests.
 */
let instance: PipelineInstance | null = null;

type PipelineInstance = {
  readonly stop: () => void;
};

/**
 * Wire the vessels store and the ghost watchdog to the dwell-time
 * machine. Idempotent: a second `startGeofencePipeline` invocation
 * is a no-op so route re-mounts (the lazy MapView Suspense
 * boundary) do not duplicate listeners.
 *
 * Side effects established by the instance:
 *   - per-vessel `$vessels.listen` callbacks (NOT a whole-snapshot
 *     `subscribe`) drive `tickGeofence` against the operational
 *     zone set for ONLY the changed vessel, reducing the per-tick
 *     PIP cost from O(vessels x zones) to O(zones).
 *   - decorative chart-art zones (the Dabie anchor / compass /
 *     smile shapes) are filtered out of the operational set so
 *     they consume zero PIP budget despite living in the same
 *     FeatureCollection as the real zones.
 *   - vessels evicted from `$vessels` trigger `forceExitVessel`,
 *     timestamped from the last seen membership entry so the
 *     synthesised Exit stays replay-deterministic.
 *   - A 60 s interval calls `sweepGhosts` so vessels that quietly
 *     stop broadcasting WHILE the eviction sweep has not yet
 *     deleted them still surface as `ghost-exit` events.
 *
 * Stopping is symmetric: `stopGeofencePipeline` tears down the
 * instance and clears the singleton slot.
 *
 * Every confirmed transition is appended to `$geofenceEvents`
 * unconditionally so the sidebar timeline reflects full history
 * including boot-time presence resolutions. UX-level silencing of
 * "I was here when you opened the app" enters lives in the toaster
 * (`geofence-toaster.tsx`), keeping the pipeline a pure log writer.
 */
export function startGeofencePipeline(): void {
  if (instance !== null) return;
  instance = createPipelineInstance();
}

/** Tear down listeners; only the app shell unmount / tests need this. */
export function stopGeofencePipeline(): void {
  instance?.stop();
  instance = null;
}

function createPipelineInstance(): PipelineInstance {
  // Closure-bound state. Every map / set / cache lives only as long
  // as this instance does; calling stop() releases all of it for GC.
  const lastPresenceSnapshot = new Map<Mmsi, ReadonlySet<ZoneId>>();
  // Identity-cached filter result for the operational zone set.
  // Re-runs only when the zone collection reference changes, NOT
  // on every AIS frame, so the per-vessel handler stays O(Z) with
  // a constant Z bound rather than O(Z) plus a filter pass each
  // time. Decorative chart art (anchor / compass / smile on Dabie)
  // carries `properties.decorative === true` and is excluded.
  const zoneCache: { ref: ZoneCollection | null; filtered: readonly Zone[] } = {
    ref: null,
    filtered: [],
  };

  function getOperationalZones(): readonly Zone[] {
    const current = $geofenceZones.get();
    if (current === zoneCache.ref) return zoneCache.filtered;
    zoneCache.ref = current;
    zoneCache.filtered = current.features.filter(f => f.properties.decorative !== true);
    return zoneCache.filtered;
  }

  function processVessel(vessel: LiveVessel): void {
    const zones = getOperationalZones();
    if (zones.length === 0) return;
    if (vessel.lng === null || vessel.lat === null) return;
    const frame: VesselPositionFrame = {
      mmsi: vessel.mmsi,
      lng: vessel.lng,
      lat: vessel.lat,
      // FSM time-as-data: drive the dwell clock from the AIS frame
      // timestamp (seconds since epoch) converted to ms so it lines
      // up with our ghost timeout and tick math.
      timestampUnix: vessel.timestampUnix * 1_000,
    };
    const prevState = $geofenceMembership.get();
    const result = tickGeofence(prevState, frame, zones, frame.timestampUnix);
    setMembershipState(result.state);
    if (result.events.length > 0) appendGeofenceEvents(result.events);
    syncPresenceFor(result.state, vessel.mmsi);
  }

  function evictVessel(mmsi: Mmsi): void {
    const prevState = $geofenceMembership.get();
    const evictionNow = lastSeenFor(prevState, mmsi) ?? Date.now();
    const result = forceExitVessel(prevState, mmsi, evictionNow);
    setMembershipState(result.state);
    if (result.events.length > 0) appendGeofenceEvents(result.events);
    syncPresenceFor(result.state, mmsi);
  }

  /**
   * Per-vessel presence diff. Walks only the membership entries
   * belonging to one mmsi (prefix scan on the flat key map), so the
   * cost is O(zones-for-this-vessel) rather than O(total entries).
   * Writes `$geofencePresence` ONLY when the confirmed-zone set
   * actually changed, keeping the per-key sidebar badge subscribers
   * quiet unless their vessel crossed a boundary this tick.
   */
  function syncPresenceFor(state: ReturnType<typeof $geofenceMembership.get>, mmsi: Mmsi): void {
    const currentZones = new Set<ZoneId>();
    const mmsiPrefix = `${mmsi}|`;
    for (const [key, entry] of state) {
      if (!key.startsWith(mmsiPrefix)) continue;
      if (!entry.confirmed) continue;
      const parsed = parseMembershipKey(key);
      if (parsed === null) continue;
      currentZones.add(parsed.zoneId);
    }
    const prev = lastPresenceSnapshot.get(mmsi);
    // First-time visit with no confirmed zones: leave the presence
    // key undefined. Writing `[]` here would pollute the store and
    // make per-key subscribers fire for vessels that have never had
    // presence in the first place (a single AIS ping inside a zone
    // before the dwell threshold confirms).
    if (prev === undefined && currentZones.size === 0) return;
    if (prev !== undefined && setsEqual(prev, currentZones)) return;
    setVesselPresence(mmsi, Array.from(currentZones));
    if (currentZones.size === 0) {
      lastPresenceSnapshot.delete(mmsi);
    } else {
      lastPresenceSnapshot.set(mmsi, currentZones);
    }
  }

  /**
   * Whole-snapshot pass. Two callers:
   *   1. Bootstrap at pipeline start - vessels already in $vessels
   *      do not fire `listen` (that fires only on subsequent
   *      changes), so we process them once explicitly here.
   *   2. Bulk replace via `$vessels.set(...)` (TTL sweep on the
   *      vessels store, test cleanup) - nanostores fires `listen`
   *      with an undefined `changedKey` in that case, so the
   *      per-key fast path below cannot reason about which vessels
   *      disappeared. We diff every still-tracked membership mmsi
   *      against the new snapshot and force-exit the missing ones.
   */
  function processWholeSnapshot(snapshot: Record<string, LiveVessel | undefined>): void {
    const currentIds = new Set<Mmsi>();
    for (const key in snapshot) {
      const vessel = snapshot[key];
      if (vessel === undefined) continue;
      currentIds.add(vessel.mmsi);
      processVessel(vessel);
    }
    // Diff against vessels we currently hold membership for; force-
    // exit any whose mmsi is no longer in the snapshot.
    const state = $geofenceMembership.get();
    const seenMmsis = new Set<Mmsi>();
    for (const key of state.keys()) {
      const parsed = parseMembershipKey(key);
      if (parsed === null) continue;
      if (seenMmsis.has(parsed.mmsi)) continue;
      seenMmsis.add(parsed.mmsi);
      if (!currentIds.has(parsed.mmsi)) evictVessel(parsed.mmsi);
    }
  }

  processWholeSnapshot($vessels.get());

  const unsubscribeVessels = $vessels.listen((value, _oldValue, changedKey) => {
    if (changedKey === undefined) {
      // Bulk replace (TTL sweep, test cleanup). nanostores signals
      // these by calling the listener with an undefined changedKey;
      // we cannot tell which vessels disappeared from the payload
      // alone, so we run the whole-snapshot diff path.
      processWholeSnapshot(value);
      return;
    }
    // Per-key change - the hot path during live AIS ingest. O(Z)
    // work per notification, NOT O(N x Z).
    const vessel = value[changedKey];
    if (vessel === undefined) {
      evictVessel(Number(changedKey) as Mmsi);
    } else {
      processVessel(vessel);
    }
  });

  const sweepHandle = setInterval(() => {
    const state = $geofenceMembership.get();
    if (state.size === 0) return;
    const result = sweepGhosts(state, Date.now(), DEFAULT_DWELL_CONFIG);
    setMembershipState(result.state);
    if (result.events.length > 0) appendGeofenceEvents(result.events);
    // After a ghost sweep, presence for any vessel that lost zones
    // needs to flip in the badge store. Re-sync only the mmsis we
    // were tracking - new vessels not in lastPresenceSnapshot can
    // not have had presence ghosted out from under them.
    for (const mmsi of lastPresenceSnapshot.keys()) {
      syncPresenceFor(result.state, mmsi);
    }
  }, GHOST_SWEEP_INTERVAL_MS);

  return {
    stop(): void {
      unsubscribeVessels();
      clearInterval(sweepHandle);
      lastPresenceSnapshot.clear();
      zoneCache.ref = null;
      zoneCache.filtered = [];
    },
  };
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
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

/**
 * Test-only access kept as a no-op for backward compatibility with
 * existing test setup blocks. The closure-bound instance state now
 * resets cleanly via `stopGeofencePipeline()` + `startGeofencePipeline()`,
 * so explicit module-state reset is redundant. The function stays
 * exported only to avoid touching every test in the same diff.
 */
export const __test = {
  resetPipelineState: (): void => {
    /* no-op; instance closures handle teardown */
  },
};

export { $geofencePresence };
export type { ZoneCollection };
