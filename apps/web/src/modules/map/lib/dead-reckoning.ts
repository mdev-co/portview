import type { LiveVessel } from '../../telemetry/types';

const MOVING_SOG_THRESHOLD_KN = 0.5;

/**
 * Conservative dead-reckoning window. After this many seconds without
 * a new report the marker freezes on the last raw fix; the operator
 * sees a stale-fix indicator instead of a synthesised path.
 */
const MAX_REASONABLE_DELTA_SEC = 60;

/**
 * Hard distance cap on projected displacement. 30 m comfortably fits
 * inside Szczecin port channels (~100 m+ wide) so a vessel cannot be
 * pushed onto land by extrapolation even at full speed. A previous
 * 200 m cap was wide enough to clear narrow channels by mistake.
 */
const MAX_EXTRAPOLATION_METERS = 30;

/**
 * Velocity damping half-life. After 30 s the projected speed is half
 * the reported SOG; the filter rapidly converges to the raw fix
 * rather than racing the vessel forward.
 */
const VELOCITY_HALF_LIFE_SEC = 30;

const KNOTS_TO_M_PER_S = 0.5144;
const METERS_PER_DEG_LAT = 111_000;

export type InterpolatedPosition = {
  readonly lng: number;
  readonly lat: number;
};

function velocityDampingFactor(deltaSec: number): number {
  if (deltaSec <= 0) return 1;
  return Math.pow(0.5, deltaSec / VELOCITY_HALF_LIFE_SEC);
}

/**
 * Conservative dead-reckoning. Between AIS reports the marker drifts
 * forward by `sog * dt * damping`, capped at MAX_EXTRAPOLATION_METERS.
 * Outside the freshness window the marker holds at the last raw fix.
 *
 * The cap is the safety net: even a 20 kn vessel cannot project more
 * than 30 m off its last fix, well within the width of any port
 * channel the map shows. The freshness window is short (60 s) so a
 * stale fix becomes a frozen marker quickly, not a wandering one.
 */
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
