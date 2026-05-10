import { map, onMount } from 'nanostores';
import { VESSEL_FLAG_HAS_FIX, VESSEL_FLAG_IS_MOVING } from '@sps/shared';
import type { LiveVessel } from './types';

/**
 * Hysteresis bounds for the IS_MOVING bit applied client-side. The
 * server-side frame builder uses a single 0.5 kn threshold so the bit
 * flips on every report whose SOG straddles that line, producing
 * visible colour flicker (underway green vs category colour) on the
 * map. We re-derive IS_MOVING from SOG with a 0.3 / 0.5 kn dead zone
 * so a vessel must clearly stop (< 0.3) before losing the bit, and
 * clearly accelerate (> 0.5) before regaining it. Inside the dead zone
 * the previous state is preserved.
 */
const IS_MOVING_ON_THRESHOLD_KN = 0.5;
const IS_MOVING_OFF_THRESHOLD_KN = 0.3;

export const $vessels = map<Record<number, LiveVessel>>({});

/**
 * AIS Class A anchored / Class B stationary broadcast every 3 minutes.
 * AisStream free tier sub-samples and occasionally drops reports.
 * 10-minute window tolerates two missed broadcast cycles before
 * evicting the vessel from the store.
 */
const STALE_THRESHOLD_SECONDS = 600;
const SWEEP_INTERVAL_MS = 30_000;

/** Drop vessels whose last update is older than STALE_THRESHOLD_SECONDS. */
function sweepStale(nowSeconds: number = Math.floor(Date.now() / 1_000)): void {
  const snapshot = $vessels.get();
  let evicted = 0;
  const next: Record<number, LiveVessel> = {};
  for (const key in snapshot) {
    const vessel = snapshot[key];
    if (vessel === undefined) continue;
    if (nowSeconds - vessel.timestampUnix > STALE_THRESHOLD_SECONDS) {
      evicted += 1;
      continue;
    }
    next[Number(key)] = vessel;
  }
  if (evicted > 0) $vessels.set(next);
}

onMount($vessels, () => {
  const interval = setInterval(sweepStale, SWEEP_INTERVAL_MS);
  return () => clearInterval(interval);
});

export const __test = { sweepStale, STALE_THRESHOLD_SECONDS };

function applyMovementHysteresis(
  prevFlags: number,
  incomingFlags: number,
  incomingSog: number | null,
): number {
  // Static-only frames carry no SOG: keep the previous movement state.
  if (incomingSog === null) {
    return (incomingFlags & ~VESSEL_FLAG_IS_MOVING) | (prevFlags & VESSEL_FLAG_IS_MOVING);
  }
  const wasMoving = (prevFlags & VESSEL_FLAG_IS_MOVING) !== 0;
  const nowMoving = wasMoving
    ? incomingSog >= IS_MOVING_OFF_THRESHOLD_KN
    : incomingSog > IS_MOVING_ON_THRESHOLD_KN;
  return nowMoving ? incomingFlags | VESSEL_FLAG_IS_MOVING : incomingFlags & ~VESSEL_FLAG_IS_MOVING;
}

export function setVessel(update: LiveVessel): void {
  const prev = $vessels.get()[update.mmsi];
  if (prev === undefined) {
    $vessels.setKey(update.mmsi, update);
    return;
  }
  // A static-only frame (AIS type 5 / 24) carries no position and computes
  // flags=0 server-side, so a naive spread would erase the HAS_FIX bit
  // earned by an earlier position frame and the marker would vanish until
  // the next type 1/2/3/18. Carry HAS_FIX over from prev when the update
  // brings no new position info, and re-derive IS_MOVING with hysteresis
  // to suppress flicker when SOG straddles the 0.5 kn threshold.
  const hasNewPosition = update.lng !== null || update.lat !== null;
  const baseFlags = hasNewPosition
    ? update.flags
    : update.flags | (prev.flags & VESSEL_FLAG_HAS_FIX);
  const flags = applyMovementHysteresis(prev.flags, baseFlags, update.sog);
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
    flags,
  });
}

export function vesselCount(): number {
  return Object.keys($vessels.get()).length;
}
