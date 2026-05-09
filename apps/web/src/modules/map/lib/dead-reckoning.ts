import type { LiveVessel } from '../../telemetry/types';

const MOVING_SOG_THRESHOLD_KN = 0.5;
const MAX_REASONABLE_DELTA_SEC = 600;
const VELOCITY_HALF_LIFE_SEC = 300;
const KNOTS_TO_M_PER_S = 0.5144;
const METERS_PER_DEG_LAT = 111_000;

export type InterpolatedPosition = {
  readonly lng: number;
  readonly lat: number;
};

/**
 * Confidence factor tuned for AisStream's free-tier sample rate, where
 * reports often arrive 3-6 min apart. Half-life 300s — at 60s elapsed
 * ~87% of reported speed survives; at 300s, 50%; at 600s, 25%. Keeps
 * vessels visibly moving across realistic feed gaps without unbounded
 * extrapolation when the report is genuinely stale.
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
  const distanceMeters = vessel.sog * KNOTS_TO_M_PER_S * deltaSec * damping;
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
