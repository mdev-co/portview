import type { LiveVessel } from '../../telemetry/types';

const MOVING_SOG_THRESHOLD_KN = 0.5;
/**
 * Beyond this staleness, the marker freezes at the exact last reported
 * position. 90s = one Class B reporting cycle (~30s underway) plus 30s
 * tolerance. Class A reports every 2-10s underway so freezing at 90s
 * still keeps fresh vessels animating; for stale ones we trust the
 * last fix over an extrapolation that has been observed to drift
 * hundreds of meters off-water. Matches MarineTraffic / VesselFinder.
 */
const MAX_REASONABLE_DELTA_SEC = 90;
/**
 * Hard distance cap on extrapolation within the freshness window.
 * 90s freeze alone is not enough: at 14 kn × 60s × damping(0.87) the
 * damped projection still reaches ~376m and observed Class B vessels
 * near Kolobrzeg / Szczecin shorelines drift onto land between report
 * cycles. 200m roughly matches the width of a working port basin and
 * keeps the marker on the navigable side of any river bank we monitor.
 */
const MAX_EXTRAPOLATION_METERS = 200;
const VELOCITY_HALF_LIFE_SEC = 300;
const KNOTS_TO_M_PER_S = 0.5144;
const METERS_PER_DEG_LAT = 111_000;

export type InterpolatedPosition = {
  readonly lng: number;
  readonly lat: number;
};

/**
 * Confidence factor applied within the freshness window
 * (delta < MAX_REASONABLE_DELTA_SEC). Half-life 300s, so within the
 * 90s window damping varies smoothly from 1.0 (fresh) to ~0.81 (90s).
 * Beyond the window we freeze at the last fix, so the half-life
 * matters only for in-window animation, not for the stale tail.
 */
function velocityDampingFactor(deltaSec: number): number {
  if (deltaSec <= 0) return 1;
  return Math.pow(0.5, deltaSec / VELOCITY_HALF_LIFE_SEC);
}

export function interpolateVesselPosition(
  vessel: LiveVessel,
  nowSeconds: number,
): InterpolatedPosition | null {
  if (vessel.lng === null || vessel.lat === null) return null;
  if (vessel.sog === null || vessel.sog <= MOVING_SOG_THRESHOLD_KN) {
    return { lng: vessel.lng, lat: vessel.lat };
  }
  const courseDeg = vessel.cog ?? vessel.trueHeading;
  if (courseDeg === null) {
    return { lng: vessel.lng, lat: vessel.lat };
  }
  const deltaSec = nowSeconds - vessel.timestampUnix;
  if (deltaSec < 0 || deltaSec > MAX_REASONABLE_DELTA_SEC) {
    return { lng: vessel.lng, lat: vessel.lat };
  }
  const damping = velocityDampingFactor(deltaSec);
  const dampedDistance = vessel.sog * KNOTS_TO_M_PER_S * deltaSec * damping;
  const distanceMeters = Math.min(dampedDistance, MAX_EXTRAPOLATION_METERS);
  const courseRad = (courseDeg * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(courseRad)) / METERS_PER_DEG_LAT;
  const dLng =
    (distanceMeters * Math.sin(courseRad)) /
    (METERS_PER_DEG_LAT * Math.cos((vessel.lat * Math.PI) / 180));
  return {
    lng: vessel.lng + dLng,
    lat: vessel.lat + dLat,
  };
}
