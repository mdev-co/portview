import { map } from 'nanostores';
import type { LiveVessel } from './types';

/**
 * Atomic per-key vessel store keyed by MMSI. setKey notifies only
 * subscribers of that specific MMSI; whole-list re-renders are
 * impossible by construction. Sized for the SPS PoC scale (50-500 live
 * vessels at 1 Hz); scales to the low thousands without changes.
 */
export const $vessels = map<Record<number, LiveVessel>>({});

/**
 * Merge an inbound vessel update into the store. Nullable spatial and
 * navigation fields fall back to the previous value when the inbound
 * frame leaves them unset, so a static-data frame (AIS type 5, no
 * position) never wipes a previously known fix. Non-nullable fields
 * (mmsi, messageType, sourceId, timestampUnix, flags, reserved) always
 * take the inbound value.
 */
export function setVessel(update: LiveVessel): void {
  const prev = $vessels.get()[update.mmsi];
  if (prev === undefined) {
    $vessels.setKey(update.mmsi, update);
    return;
  }
  $vessels.setKey(update.mmsi, {
    ...prev,
    ...update,
    lng: update.lng ?? prev.lng,
    lat: update.lat ?? prev.lat,
    sog: update.sog ?? prev.sog,
    cog: update.cog ?? prev.cog,
    trueHeading: update.trueHeading ?? prev.trueHeading,
    navStatus: update.navStatus ?? prev.navStatus,
    rateOfTurn: update.rateOfTurn ?? prev.rateOfTurn,
  });
}

/** Number of vessels currently tracked. Cheap O(1) Object.keys length. */
export function vesselCount(): number {
  return Object.keys($vessels.get()).length;
}
