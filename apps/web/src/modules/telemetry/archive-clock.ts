import { atom } from 'nanostores';

/**
 * Unix seconds the display clock is pinned to while the live AIS feed is
 * down and the map shows the last known positions (see
 * `archive-snapshot.ts`). `null` while the feed is live.
 */
export const $archiveAnchorUnix = atom<number | null>(null);

/**
 * "Now" for every age-derived view: eviction, marker fading, dead
 * reckoning, relative times and geofence ghost sweeps. Returns the pinned
 * anchor in archive mode so the snapshot renders exactly as it did at that
 * moment, and the wall clock otherwise.
 */
export function displayNowSeconds(): number {
  return $archiveAnchorUnix.get() ?? Math.floor(Date.now() / 1_000);
}
