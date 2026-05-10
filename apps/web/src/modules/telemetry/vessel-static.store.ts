import { map, onMount } from 'nanostores';
import type { VesselStaticDataFrame } from '@sps/shared';
import { $vessels } from './vessels.store';

/**
 * MMSI-keyed cache of static-data frames received over /ws/telemetry.
 *
 * Static data (AIS type 5) arrives once per voyage segment and rarely
 * changes within a session. Position and static updates land in
 * separate stores by design: position is high-frequency and TTL-evicted
 * by `$vessels`, static is low-frequency and survives many position
 * updates. Splitting them keeps the hot-path map() typed by
 * VesselUpdateFrame and lets list components subscribe to whichever
 * store they need.
 *
 * Eviction: a static entry is dropped when its mmsi no longer appears
 * in `$vessels` (the position store handles staleness; static rides on
 * its decision). Sweeping by static `receivedAt` would be wrong since
 * static is broadcast rarely - a fresh static + dropped position
 * record means the vessel is gone, not the metadata.
 */
const SWEEP_INTERVAL_MS = 60_000;

export const $vesselStaticData = map<Record<number, VesselStaticDataFrame>>({});

export function setVesselStatic(frame: VesselStaticDataFrame): void {
  $vesselStaticData.setKey(frame.mmsi, frame);
}

export function vesselStaticCount(): number {
  return Object.keys($vesselStaticData.get()).length;
}

function sweepOrphans(): void {
  const live = $vessels.get();
  const snapshot = $vesselStaticData.get();
  let evicted = 0;
  const next: Record<number, VesselStaticDataFrame> = {};
  for (const key in snapshot) {
    const mmsi = Number(key);
    if (live[mmsi] === undefined) {
      evicted += 1;
      continue;
    }
    const entry = snapshot[mmsi];
    if (entry !== undefined) next[mmsi] = entry;
  }
  if (evicted > 0) $vesselStaticData.set(next);
}

onMount($vesselStaticData, () => {
  const interval = setInterval(sweepOrphans, SWEEP_INTERVAL_MS);
  return () => clearInterval(interval);
});

export const __test = { sweepOrphans, SWEEP_INTERVAL_MS };
