import { map, onMount } from 'nanostores';
import {
  VESSEL_HISTORY_MAX_POINTS,
  type VesselHistoryPoint,
  type VesselKalmanState,
} from '@sps/shared';
import { $vessels } from './vessels.store';

/**
 * MMSI-keyed rolling buffer of recent position fixes. Powers two
 * features:
 *  - Trail rendering on the map (polyline of the last N points)
 *  - Smoothed dead-reckoning that consumes velocity from the last
 *    samples instead of the single latest report
 *
 * The buffer is bounded at VESSEL_HISTORY_MAX_POINTS per mmsi. New
 * points push to the end; the oldest is dropped when the buffer fills.
 * Eviction tracks the live `$vessels` store: when a vessel is dropped
 * from `$vessels` (TTL sweep) its history goes with it.
 *
 * Two additional filters keep the trail honest:
 *  - Time window: points older than TRAIL_AGE_MAX_SECONDS are dropped
 *    on every read-modify-write, so a slow-broadcasting anchored vessel
 *    cannot show a 90 minute spaghetti track from its last 30 fixes.
 *  - Outlier rejection: an inbound point whose distance from the most
 *    recent point exceeds a realistic-max-speed projection is dropped,
 *    so a single GPS spoof / multi-receiver swap cannot draw a line
 *    onto land.
 */
export const $vesselPositionHistory = map<Record<number, readonly VesselHistoryPoint[]>>({});

/** MMSI-keyed last known Kalman filter state from the server snapshot. */
export const $vesselKalmanState = map<Record<number, VesselKalmanState>>({});

const SWEEP_INTERVAL_MS = 60_000;

/** Drop history points older than this many seconds before render time. */
export const TRAIL_AGE_MAX_SECONDS = 300;

/**
 * Max realistic vessel speed used by the outlier filter (knots).
 * 60 kn covers fast craft (pilot boats, patrol) with a wide margin;
 * commercial cargo / tanker traffic peaks well below.
 */
const MAX_REALISTIC_SPEED_KN = 60;
const KNOTS_TO_M_PER_S = 0.5144;
const METERS_PER_DEG_LAT = 111_000;
/** Static slack added to the projected radius (GPS jitter floor). */
const OUTLIER_TOLERANCE_METERS = 75;

function approximateDistanceMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  // Equirectangular approximation, fine for sub-kilometre / mid-latitude
  // checks. Not accurate near the poles; SPS operates at 53 deg N where
  // this is well within tolerance.
  const meanLatRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dLat = (bLat - aLat) * METERS_PER_DEG_LAT;
  const dLng = (bLng - aLng) * METERS_PER_DEG_LAT * Math.cos(meanLatRad);
  return Math.hypot(dLng, dLat);
}

function isOutlier(prev: VesselHistoryPoint, next: VesselHistoryPoint): boolean {
  const dt = Math.max(0, next.timestampUnix - prev.timestampUnix);
  if (dt === 0) {
    // Same-second reports: identical timestamps mean the same broadcast
    // and slight coordinate variance is GPS noise, not a jump.
    return false;
  }
  const maxMeters = MAX_REALISTIC_SPEED_KN * KNOTS_TO_M_PER_S * dt + OUTLIER_TOLERANCE_METERS;
  const distance = approximateDistanceMeters(prev.lng, prev.lat, next.lng, next.lat);
  return distance > maxMeters;
}

function trimByAge(
  points: readonly VesselHistoryPoint[],
  nowSeconds: number,
): readonly VesselHistoryPoint[] {
  const cutoff = nowSeconds - TRAIL_AGE_MAX_SECONDS;
  // Points are stored in chronological order; find the first index that
  // is still within the window and slice from there.
  let firstFresh = 0;
  while (firstFresh < points.length && points[firstFresh]!.timestampUnix < cutoff) {
    firstFresh += 1;
  }
  return firstFresh === 0 ? points : points.slice(firstFresh);
}

export function appendHistoryPoint(
  mmsi: number,
  point: VesselHistoryPoint,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): void {
  const current = $vesselPositionHistory.get()[mmsi] ?? [];
  const lastPoint = current.length > 0 ? current[current.length - 1] : undefined;
  // Outlier rejection only. The out-of-order guard was too aggressive
  // for AisStream's sub sampled feed (mixed receiver clocks dropped
  // legitimate updates and the marker stalled), so the buffer accepts
  // any non-outlier point and the trail tolerates minor re-ordering.
  if (lastPoint !== undefined && isOutlier(lastPoint, point)) {
    return;
  }
  // Trim before appending so the time window stays enforced even when
  // the buffer is below capacity.
  const trimmed = trimByAge(current, nowSeconds);
  const withPoint = [...trimmed, point];
  const capped =
    withPoint.length > VESSEL_HISTORY_MAX_POINTS
      ? withPoint.slice(withPoint.length - VESSEL_HISTORY_MAX_POINTS)
      : withPoint;
  $vesselPositionHistory.setKey(mmsi, capped);
}

export function setHistoryFromSnapshot(
  mmsi: number,
  points: readonly VesselHistoryPoint[],
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): void {
  // Snapshot already capped server-side at VESSEL_HISTORY_MAX_POINTS
  // and chronologically ordered. Trim by age and remove same-mmsi
  // outliers in case the upstream history carried any (multi-source
  // mixing, replay).
  const aged = trimByAge(points, nowSeconds);
  const filtered: VesselHistoryPoint[] = [];
  for (const point of aged) {
    const previous = filtered[filtered.length - 1];
    if (previous !== undefined && isOutlier(previous, point)) continue;
    filtered.push(point);
  }
  const capped =
    filtered.length > VESSEL_HISTORY_MAX_POINTS
      ? filtered.slice(filtered.length - VESSEL_HISTORY_MAX_POINTS)
      : filtered;
  $vesselPositionHistory.setKey(mmsi, capped);
}

export function setKalmanState(mmsi: number, state: VesselKalmanState): void {
  $vesselKalmanState.setKey(mmsi, state);
}

function sweepOrphans(nowSeconds: number = Math.floor(Date.now() / 1_000)): void {
  const live = $vessels.get();
  const history = $vesselPositionHistory.get();
  const kalman = $vesselKalmanState.get();
  let mutatedHistory = false;
  let evictedKalman = 0;
  const nextHistory: Record<number, readonly VesselHistoryPoint[]> = {};
  const nextKalman: Record<number, VesselKalmanState> = {};
  for (const key in history) {
    const mmsi = Number(key);
    const entry = history[mmsi];
    if (entry === undefined) continue;
    if (live[mmsi] === undefined) {
      mutatedHistory = true;
      continue;
    }
    const trimmed = trimByAge(entry, nowSeconds);
    if (trimmed.length === 0) {
      mutatedHistory = true;
      continue;
    }
    if (trimmed !== entry) mutatedHistory = true;
    nextHistory[mmsi] = trimmed;
  }
  for (const key in kalman) {
    const mmsi = Number(key);
    if (live[mmsi] === undefined) {
      evictedKalman += 1;
      continue;
    }
    const entry = kalman[mmsi];
    if (entry !== undefined) nextKalman[mmsi] = entry;
  }
  if (mutatedHistory) $vesselPositionHistory.set(nextHistory);
  if (evictedKalman > 0) $vesselKalmanState.set(nextKalman);
}

onMount($vesselPositionHistory, () => {
  const interval = setInterval(() => sweepOrphans(), SWEEP_INTERVAL_MS);
  return () => clearInterval(interval);
});

export const __test = { sweepOrphans, SWEEP_INTERVAL_MS, trimByAge, isOutlier };
