import { map, onMount } from 'nanostores';
import type { LiveVessel } from './types';

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

export function vesselCount(): number {
  return Object.keys($vessels.get()).length;
}
