import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Mmsi } from '../types/brands';

/**
 * Branded identifier for a geofence zone. The brand is a phantom
 * (erased at runtime) but it keeps the type system honest: a raw
 * string from operator-drawn or hard-coded zones cannot be confused
 * with an unrelated identifier when it flows through stores, events
 * and the dwell-time machine.
 */
declare const __zoneId: unique symbol;
export type ZoneId = string & { readonly [__zoneId]: 'ZoneId' };

export function zoneId(raw: string): ZoneId {
  return raw as ZoneId;
}

/**
 * Visual / semantic category of a zone. The renderer dispatches the
 * fill / stroke / label affordances by kind so a future "restricted
 * military" zone can render with hatched red without changing the
 * core membership logic. The string-union is the discriminator that
 * lets the registry pattern slot in without touching consumers.
 */
export type ZoneKind = 'anchorage' | 'channel' | 'restricted' | 'harbor' | 'general';

/**
 * Properties carried on every Zone Feature. Kept narrow so the same
 * structure round-trips through operator drawing (terra-draw output)
 * and the hard-coded Szczecin set with no transform layer.
 */
export type ZoneProperties = {
  /** Stable identifier; used in events, state, and rendering keys. */
  readonly id: ZoneId;
  /** Operator-facing label rendered on map and in toasts. */
  readonly label: string;
  /** Visual / semantic category - the renderer dispatches on this. */
  readonly kind: ZoneKind;
  /** Optional one-line description for tooltip / detail panel. */
  readonly description?: string;
  /**
   * Operator-controlled map visibility. `undefined` and `true` render
   * the zone on the map; `false` hides it. Hidden zones still take
   * part in the dwell-time pipeline so events fire as usual - this
   * flag is a rendering preference, not a logic gate.
   */
  readonly visible?: boolean;
  /**
   * Mark a zone as decorative chart art (anchor outline, compass
   * rose, smiley face). The map renderer omits the label for
   * decorative zones so the shape reads cleanly without text
   * occluding the geometry. The dwell-time pipeline ignores this
   * flag - decorative zones still take part in PIP checks but
   * vessels rarely sit there in practice.
   */
  readonly decorative?: boolean;
};

/**
 * A single zone is a GeoJSON Polygon Feature carrying our properties.
 * Choosing GeoJSON as the canonical representation means terra-draw
 * output (already GeoJSON), hard-coded zones, and any future
 * persistence layer all share one shape - no adapters between layers.
 */
export type Zone = Feature<Polygon, ZoneProperties>;

/**
 * Collection of zones. The runtime store is an atom over this shape.
 * GeoJSON FeatureCollection is also exactly what terra-draw consumes
 * and emits, so save/load round-trips are trivial.
 */
export type ZoneCollection = FeatureCollection<Polygon, ZoneProperties>;

/**
 * Per-(mmsi, zoneId) tracking record kept inside the dwell-time
 * machine. The state machine is "vessel is currently inside or
 * outside, since when, and has the dwell threshold elapsed".
 *
 * Memory note: an entry exists in the membership map ONLY when a
 * vessel has had at least one frame near or inside a zone. On a
 * confirmed Exit the entry is removed entirely - we never carry
 * `confirmed: false` ghost entries forward. State size is therefore
 * bounded by O(active vessels currently engaged with zones).
 */
export type MembershipEntry = {
  /** Wall-clock timestamp of the first INSIDE frame in the current run. Null when currently outside. */
  insideSince: number | null;
  /** Wall-clock timestamp of the first OUTSIDE frame in the current run. Null when currently inside. */
  outsideSince: number | null;
  /** Have we emitted ENTER for this run? Reset to false after confirmed EXIT (= entry deleted). */
  confirmed: boolean;
  /** Timestamp of the last frame we have seen for this (mmsi, zoneId). Drives the ghost-ship watchdog. */
  lastSeenAt: number;
};

/**
 * Composite key into the membership map. Pairs are flattened to
 * `${mmsi}|${zoneId}` strings so the map can be a plain Map<string,
 * MembershipEntry> without per-key allocation cost.
 */
export type MembershipKey = string;

export function membershipKey(mmsi: Mmsi, id: ZoneId): MembershipKey {
  return `${mmsi}|${id}`;
}

export function parseMembershipKey(key: MembershipKey): { mmsi: Mmsi; zoneId: ZoneId } | null {
  const [mmsiStr, idStr] = key.split('|');
  if (mmsiStr === undefined || idStr === undefined) return null;
  const mmsiNum = Number(mmsiStr);
  if (!Number.isFinite(mmsiNum)) return null;
  return { mmsi: mmsiNum as Mmsi, zoneId: idStr as ZoneId };
}

/**
 * Discriminated union of geofence events emitted by the state
 * machine. Consumers (toast UI, sidebar history) pattern-match on
 * the `kind` to render the right affordance. Every event carries
 * the AIS frame timestamp that triggered it (NOT Date.now) so
 * replays and timeline navigation produce identical output.
 */
export type GeofenceEvent =
  | {
      readonly kind: 'enter';
      readonly mmsi: Mmsi;
      readonly zoneId: ZoneId;
      /** Frame timestamp at which the dwell threshold confirmed Enter. */
      readonly at: number;
    }
  | {
      readonly kind: 'exit';
      readonly mmsi: Mmsi;
      readonly zoneId: ZoneId;
      readonly at: number;
    }
  | {
      readonly kind: 'ghost-exit';
      readonly mmsi: Mmsi;
      readonly zoneId: ZoneId;
      /** Frame-or-tick timestamp at which the ghost timeout elapsed. */
      readonly at: number;
      /** How long we waited before declaring the ghost; for telemetry. */
      readonly silentForMs: number;
    };

/**
 * Snapshot of an operator-visible "which vessel is in which zones".
 * Derived from the membership map by keeping only confirmed entries.
 * Used by the sidebar badge and the map highlight expressions.
 */
export type GeofencePresence = ReadonlyMap<Mmsi, ReadonlySet<ZoneId>>;
