import { atom, map } from 'nanostores';
import type { MembershipState, ZoneId } from '@sps/shared';

/**
 * Runtime membership state for the dwell-time machine. Holds the
 * raw per-(mmsi, zoneId) tracking entries. Consumers should NOT
 * read this directly except in tests - the operator-visible
 * projection is `$geofencePresence`, which keeps only the
 * confirmed entries and is keyed for per-vessel subscriptions.
 */
export const $geofenceMembership = atom<MembershipState>(new Map());

/**
 * Operator-visible "which zones is each vessel currently confirmed
 * inside" projection. Implemented as `map<Record<mmsiAsString,
 * readonly ZoneId[]>>` so consumers (sidebar badge per vessel)
 * subscribe to ONE key via `useStore($geofencePresence, { keys:
 * [String(mmsi)] })` and re-render only when that vessel's zone
 * membership actually changes - not on every AIS frame.
 *
 * A computed atom would have notified every subscriber wholesale at
 * the full AIS rate; per-key map writes (`setKey(mmsi, [zones])`)
 * combined with the pipeline's diff-before-write logic keep the
 * render fan-out scoped to vessels whose presence set actually
 * flipped on this tick. Critical for the sidebar's L6 high-freq
 * budget (`ref + DOM mutation, not setState`).
 *
 * Empty arrays are written for vessels that no longer belong to any
 * zone so consumers can distinguish "never engaged" (key absent)
 * from "currently outside every zone" (key present with empty
 * array). UI typically treats both as `?? []` so the distinction
 * is invisible there; the explicit empty value lets us avoid a
 * separate `deleteKey` semantic that nanostores does not expose.
 */
export const $geofencePresence = map<Record<string, readonly ZoneId[]>>({});

/** Atomic write wrapper for the membership atom; keeps producers explicit. */
export function setMembershipState(next: MembershipState): void {
  $geofenceMembership.set(next);
}

/**
 * Write a single vessel's confirmed-zone array. Used by the pipeline
 * only for vessels whose presence set changed in the current tick;
 * the diff happens upstream so this write is already minimal.
 */
export function setVesselPresence(mmsi: number, zones: readonly ZoneId[]): void {
  $geofencePresence.setKey(String(mmsi), zones);
}
