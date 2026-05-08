import { map } from 'nanostores';
import type { LiveVessel } from './types';

/**
 * Atomic per-key vessel store keyed by MMSI. setKey notifies only
 * subscribers of that specific MMSI; whole-list re-renders are
 * impossible by construction. Sized for the SPS PoC scale (50-500 live
 * vessels at 1 Hz); scales to the low thousands without changes.
 */
export const $vessels = map<Record<number, LiveVessel>>({});

/** Idempotent overwrite of a vessel entry. */
export function setVessel(vessel: LiveVessel): void {
  $vessels.setKey(vessel.mmsi, vessel);
}

/** Number of vessels currently tracked. Cheap O(1) Object.keys length. */
export function vesselCount(): number {
  return Object.keys($vessels.get()).length;
}
