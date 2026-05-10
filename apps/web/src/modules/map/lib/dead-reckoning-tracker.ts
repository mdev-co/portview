import type { LiveVessel } from '../../telemetry/types';
import { interpolateVesselPosition } from './dead-reckoning';

const TRANSITION_DURATION_MS = 1_500;

/**
 * If consecutive render ticks are spaced further apart than this, treat
 * the gap as a paused frame loop (tab background, map pan, GC pause)
 * and snap displayed position to the current target instead of letting
 * the vessel "torpedo" forward to catch up with extrapolated time.
 */
const PAUSE_DETECTION_THRESHOLD_MS = 400;
let lastTickAtMs = 0;

type DisplayState = {
  displayedLng: number;
  displayedLat: number;
  startLng: number;
  startLat: number;
  targetLng: number;
  targetLat: number;
  lastSeenTimestampUnix: number;
  transitionStartedAtMs: number;
};

const trackerState = new Map<number, DisplayState>();

function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * easeInOutCubic(t);
}

export function smoothedDisplayPosition(
  vessel: LiveVessel,
  nowSeconds: number,
  nowMs: number = Date.now(),
): { lng: number; lat: number } | null {
  const target = interpolateVesselPosition(vessel, nowSeconds);
  if (target === null) return null;

  const isResumingFromPause =
    lastTickAtMs !== 0 && nowMs - lastTickAtMs > PAUSE_DETECTION_THRESHOLD_MS;
  lastTickAtMs = nowMs;

  const prev = trackerState.get(vessel.mmsi);

  if (prev === undefined) {
    trackerState.set(vessel.mmsi, {
      displayedLng: target.lng,
      displayedLat: target.lat,
      startLng: target.lng,
      startLat: target.lat,
      targetLng: target.lng,
      targetLat: target.lat,
      lastSeenTimestampUnix: vessel.timestampUnix,
      transitionStartedAtMs: nowMs - TRANSITION_DURATION_MS,
    });
    return target;
  }

  if (isResumingFromPause) {
    prev.displayedLng = target.lng;
    prev.displayedLat = target.lat;
    prev.startLng = target.lng;
    prev.startLat = target.lat;
    prev.targetLng = target.lng;
    prev.targetLat = target.lat;
    prev.lastSeenTimestampUnix = vessel.timestampUnix;
    prev.transitionStartedAtMs = nowMs - TRANSITION_DURATION_MS;
    return target;
  }

  if (vessel.timestampUnix !== prev.lastSeenTimestampUnix) {
    // If the previous transition is still running (next AIS report arrived
    // before the lerp finished), update the target in place so the
    // animation glides to the freshest position instead of restarting from
    // a stale `start` point on every burst report. The visual symptom
    // before this fix was a vessel appearing to "stall" while bursting
    // rapid updates, because each restart truncated the previous lerp.
    const elapsedMs = nowMs - prev.transitionStartedAtMs;
    if (elapsedMs >= TRANSITION_DURATION_MS) {
      prev.startLng = prev.displayedLng;
      prev.startLat = prev.displayedLat;
      prev.transitionStartedAtMs = nowMs;
    }
    prev.targetLng = target.lng;
    prev.targetLat = target.lat;
    prev.lastSeenTimestampUnix = vessel.timestampUnix;
  } else {
    prev.targetLng = target.lng;
    prev.targetLat = target.lat;
  }

  const elapsedMs = nowMs - prev.transitionStartedAtMs;
  if (elapsedMs >= TRANSITION_DURATION_MS) {
    prev.displayedLng = prev.targetLng;
    prev.displayedLat = prev.targetLat;
  } else {
    const t = elapsedMs / TRANSITION_DURATION_MS;
    prev.displayedLng = lerp(prev.startLng, prev.targetLng, t);
    prev.displayedLat = lerp(prev.startLat, prev.targetLat, t);
  }

  return { lng: prev.displayedLng, lat: prev.displayedLat };
}

export function pruneTrackerState(activeMmsis: ReadonlySet<number>): void {
  for (const mmsi of trackerState.keys()) {
    if (!activeMmsis.has(mmsi)) trackerState.delete(mmsi);
  }
}

export function __resetTrackerForTests(): void {
  trackerState.clear();
  lastTickAtMs = 0;
}
