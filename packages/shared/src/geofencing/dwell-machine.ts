import type { Mmsi } from '../types/brands';
import { isInsideZone } from './point-in-polygon';
import {
  type GeofenceEvent,
  type GeofencePresence,
  type MembershipEntry,
  type MembershipKey,
  type Zone,
  type ZoneId,
  membershipKey,
  parseMembershipKey,
} from './types';

/**
 * How long a vessel must be continuously INSIDE a zone before we
 * emit an Enter event. Picked larger than the AIS Class A broadcast
 * interval (2-10 s for an underway vessel) so a single noisy fix
 * cannot trigger a phantom enter. Tuneable at the call site via the
 * config parameter on `tickGeofence`.
 */
export const DEFAULT_DWELL_MS = 30_000;

/**
 * If we have not seen any frame for a (mmsi, zoneId) for this long
 * we declare the vessel a ghost and synthesise an Exit. Class A
 * underway vessels broadcast every few seconds; Class B and anchored
 * vessels can go quiet for 3 minutes. 10 minutes covers the realistic
 * silent window without leaking confirmed-inside state indefinitely.
 */
export const DEFAULT_GHOST_TIMEOUT_MS = 600_000;

export type DwellConfig = {
  readonly dwellMs: number;
  readonly ghostTimeoutMs: number;
};

export const DEFAULT_DWELL_CONFIG: DwellConfig = {
  dwellMs: DEFAULT_DWELL_MS,
  ghostTimeoutMs: DEFAULT_GHOST_TIMEOUT_MS,
};

/**
 * Membership state is a flat Map keyed by `${mmsi}|${zoneId}`. The
 * flatness matters: at sweep time we walk the map once instead of a
 * nested {Mmsi -> {ZoneId -> Entry}} structure. Empty entries are
 * deleted, not retained, so map size tracks active engagement only.
 */
export type MembershipState = ReadonlyMap<MembershipKey, MembershipEntry>;

export type VesselPositionFrame = {
  readonly mmsi: Mmsi;
  readonly lng: number;
  readonly lat: number;
  /** AIS frame timestamp in unix seconds OR milliseconds; the unit MUST match the `now` parameter on `tickGeofence`. */
  readonly timestampUnix: number;
};

export type TickResult = {
  readonly state: MembershipState;
  readonly events: readonly GeofenceEvent[];
};

/**
 * Apply one vessel position frame to the membership state.
 *
 * Pure function: same inputs always produce the same output. `now`
 * is taken as an explicit parameter (NOT read from `Date.now`) so
 * the machine is deterministic under message replay, WebSocket
 * backlogs, and browser tab throttling. In production `now` is
 * sourced from `frame.timestampUnix`; in tests the time is injected
 * explicitly.
 *
 * Algorithm per zone:
 * 1. Compute whether the new fix is inside the polygon (PIP).
 * 2. Look up the prior (mmsi, zoneId) entry, if any.
 * 3. Apply the dwell-time hysteresis to decide Enter / Exit / no-op.
 * 4. Update `lastSeenAt` for ghost-watchdog accounting.
 * 5. Delete the entry when both runs are settled AND the vessel is
 *    confirmed outside - keeps the map size bounded.
 */
export function tickGeofence(
  prevState: MembershipState,
  frame: VesselPositionFrame,
  zones: readonly Zone[],
  now: number,
  config: DwellConfig = DEFAULT_DWELL_CONFIG,
): TickResult {
  const next = new Map(prevState);
  const events: GeofenceEvent[] = [];

  for (const zone of zones) {
    const id = zone.properties.id;
    const key = membershipKey(frame.mmsi, id);
    const prior = prevState.get(key);
    const inside = isInsideZone(frame.lng, frame.lat, zone);
    const transition = computeTransition(prior, inside, now, config.dwellMs);

    if (transition.event !== null) {
      events.push(emitEvent(transition.event, frame.mmsi, id, now));
    }

    if (transition.entry === null) {
      next.delete(key);
    } else {
      next.set(key, transition.entry);
    }
  }

  return { state: next, events };
}

/**
 * Sweep the membership state for ghost vessels. A (mmsi, zoneId)
 * entry whose `lastSeenAt` is older than `ghostTimeoutMs` AND that
 * is currently `confirmed: true` gets a synthesised Exit so the UI
 * does not show a vessel parked in a zone forever after its
 * transponder went silent. Confirmed-outside entries that have just
 * been waiting out the dwell timer are also dropped from the map -
 * they cannot turn into events anymore once the source disappeared.
 *
 * Called periodically (every few seconds) and on explicit vessel
 * eviction from `$vessels`.
 */
export function sweepGhosts(
  prevState: MembershipState,
  now: number,
  config: DwellConfig = DEFAULT_DWELL_CONFIG,
): TickResult {
  const next = new Map(prevState);
  const events: GeofenceEvent[] = [];

  for (const [key, entry] of prevState) {
    const silentForMs = now - entry.lastSeenAt;
    if (silentForMs < config.ghostTimeoutMs) continue;

    const parsed = parseMembershipKey(key);
    if (parsed === null) {
      next.delete(key);
      continue;
    }
    if (entry.confirmed) {
      events.push({
        kind: 'ghost-exit',
        mmsi: parsed.mmsi,
        zoneId: parsed.zoneId,
        at: now,
        silentForMs,
      });
    }
    next.delete(key);
  }

  return { state: next, events };
}

/**
 * Force-exit every confirmed entry for a vessel and drop all of its
 * keys from the map. Called when a vessel is evicted from
 * `$vessels` (TTL sweep) so a vanished vessel cannot remain visually
 * parked in a zone. Distinguished from the periodic ghost sweep
 * because here we have positive evidence (eviction signal) rather
 * than relying on the silent-for-N-minutes heuristic.
 */
export function forceExitVessel(prevState: MembershipState, mmsi: Mmsi, now: number): TickResult {
  const next = new Map(prevState);
  const events: GeofenceEvent[] = [];

  for (const [key, entry] of prevState) {
    const parsed = parseMembershipKey(key);
    if (parsed === null || parsed.mmsi !== mmsi) continue;
    if (entry.confirmed) {
      events.push({
        kind: 'exit',
        mmsi: parsed.mmsi,
        zoneId: parsed.zoneId,
        at: now,
      });
    }
    next.delete(key);
  }

  return { state: next, events };
}

/**
 * Project the membership state onto the operator-visible "vessel is
 * currently considered inside these zones" view. Only confirmed
 * entries contribute - the unconfirmed half of the dwell run is
 * invisible until the threshold elapses.
 */
export function computePresence(state: MembershipState): GeofencePresence {
  const presence = new Map<Mmsi, Set<ZoneId>>();
  for (const [key, entry] of state) {
    if (!entry.confirmed) continue;
    const parsed = parseMembershipKey(key);
    if (parsed === null) continue;
    const set = presence.get(parsed.mmsi) ?? new Set<ZoneId>();
    set.add(parsed.zoneId);
    presence.set(parsed.mmsi, set);
  }
  return presence;
}

type TransitionResult = {
  readonly event: GeofenceEvent['kind'] | null;
  readonly entry: MembershipEntry | null;
};

function computeTransition(
  prior: MembershipEntry | undefined,
  inside: boolean,
  now: number,
  dwellMs: number,
): TransitionResult {
  if (prior === undefined) {
    // First time we have seen this (mmsi, zoneId) - establish a run.
    return {
      event: null,
      entry: inside
        ? { insideSince: now, outsideSince: null, confirmed: false, lastSeenAt: now }
        : null, // No engagement yet; do not allocate a key for "vessel outside random zone".
    };
  }

  if (inside) {
    // Currently inside.
    if (prior.insideSince === null) {
      // We were outside last tick, now inside. Start a new inside run.
      return {
        event: null,
        entry: {
          insideSince: now,
          outsideSince: null,
          confirmed: prior.confirmed,
          lastSeenAt: now,
        },
      };
    }

    const insideForMs = now - prior.insideSince;
    if (!prior.confirmed && insideForMs >= dwellMs) {
      return {
        event: 'enter',
        entry: {
          insideSince: prior.insideSince,
          outsideSince: null,
          confirmed: true,
          lastSeenAt: now,
        },
      };
    }
    // Still building dwell time, or already confirmed - just touch lastSeenAt.
    return {
      event: null,
      entry: {
        insideSince: prior.insideSince,
        outsideSince: null,
        confirmed: prior.confirmed,
        lastSeenAt: now,
      },
    };
  }

  // Currently outside.
  if (prior.outsideSince === null) {
    // We were inside last tick, now outside. Start a new outside run.
    return {
      event: null,
      entry: {
        insideSince: null,
        outsideSince: now,
        confirmed: prior.confirmed,
        lastSeenAt: now,
      },
    };
  }

  const outsideForMs = now - prior.outsideSince;
  if (prior.confirmed && outsideForMs >= dwellMs) {
    // Confirmed exit: drop the key entirely - memory bound preserved.
    return {
      event: 'exit',
      entry: null,
    };
  }
  if (!prior.confirmed && outsideForMs >= dwellMs) {
    // We were oscillating on the boundary but never confirmed Enter.
    // Drop the key; the vessel has clearly drifted away and we should
    // not keep "almost was inside" state forever.
    return {
      event: null,
      entry: null,
    };
  }
  // Still inside the outside-dwell window - keep the entry, touch lastSeenAt.
  return {
    event: null,
    entry: {
      insideSince: null,
      outsideSince: prior.outsideSince,
      confirmed: prior.confirmed,
      lastSeenAt: now,
    },
  };
}

function emitEvent(kind: GeofenceEvent['kind'], mmsi: Mmsi, id: ZoneId, at: number): GeofenceEvent {
  if (kind === 'enter') return { kind: 'enter', mmsi, zoneId: id, at };
  if (kind === 'exit') return { kind: 'exit', mmsi, zoneId: id, at };
  // 'ghost-exit' is emitted only from sweepGhosts; the transition
  // path never produces it directly. Keep the union total.
  return { kind: 'ghost-exit', mmsi, zoneId: id, at, silentForMs: 0 };
}
