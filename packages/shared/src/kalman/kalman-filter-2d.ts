/**
 * Constant-velocity Kalman filter for vessel position in lng / lat.
 *
 * State vector x = [lng, lat, vlng, vlat] where vlng / vlat are degrees
 * per second. Measurement vector z = [lng, lat]. The transition matrix
 * is the standard CV model:
 *
 *   F = | 1 0 dt 0 |
 *       | 0 1 0 dt |
 *       | 0 0 1 0  |
 *       | 0 0 0 1  |
 *
 * Process noise Q is built from a per-axis acceleration noise sigma so
 * the filter trusts the model on short dt and trusts the measurement
 * on long dt. Measurement noise R is a fixed 2x2 diagonal derived from
 * the GPS measurement sigma. The filter operates directly on geographic
 * degrees - this is an approximation valid for the short distances and
 * small dt this codebase handles (single port, sub-minute reporting).
 * For ocean-scale tracking the state would live in a local tangent
 * plane (ENU) instead.
 *
 * The filter is intentionally framework-agnostic: no imports beyond
 * type aliases, no IO, no time source. The caller passes dt and the
 * measurement, the filter returns the new state. Persistence and
 * scheduling live in `apps/api/src/telemetry-ws` and the FE consumer.
 */

/** 4x4 covariance matrix flattened row-major. */
export type Covariance4 = readonly number[]; // length 16

/**
 * Filter state. Immutable: every operation returns a fresh state.
 * Mutating in place is tempting for hot paths but every receiver here
 * also persists / serialises the state, so the immutable surface keeps
 * the math layer free of aliasing footguns.
 */
export type KalmanState2D = {
  readonly lng: number;
  readonly lat: number;
  readonly vlng: number; // degrees per second
  readonly vlat: number;
  readonly covariance: Covariance4;
};

const STATE_DIM = 4;

/**
 * Default per-axis acceleration sigma. Tuned for vessels in port:
 * roughly 0.1 m/s^2, converted to degrees/s^2 at 53 deg N.
 * 1 deg lat ~= 111_000 m, so 0.1 / 111_000 ~= 9e-7 deg/s^2.
 * The square enters Q as variance.
 */
export const DEFAULT_ACCEL_SIGMA = 9e-7;

/**
 * Default measurement sigma. AIS position reports nominally have ~10 m
 * accuracy, which at 53 deg N corresponds to ~9e-5 deg lat and a
 * slightly larger deg lng (cos(53) ~= 0.6). Squared as variance.
 */
export const DEFAULT_MEASUREMENT_SIGMA = 9e-5;

/**
 * Initial filter at the first sighting. Position taken from the
 * measurement, velocity assumed zero, covariance large so the first
 * few measurements pull the state quickly toward the truth.
 */
export function initKalmanState2D(
  lng: number,
  lat: number,
  initialPositionSigma = DEFAULT_MEASUREMENT_SIGMA * 10,
  initialVelocitySigma = 1e-5,
): KalmanState2D {
  const pVar = initialPositionSigma * initialPositionSigma;
  const vVar = initialVelocitySigma * initialVelocitySigma;
  // Diagonal covariance, no cross-axis correlation at init.
  const cov = new Array<number>(STATE_DIM * STATE_DIM).fill(0);
  cov[0] = pVar;
  cov[5] = pVar;
  cov[10] = vVar;
  cov[15] = vVar;
  return { lng, lat, vlng: 0, vlat: 0, covariance: cov };
}

function matIndex(row: number, col: number): number {
  return row * STATE_DIM + col;
}

/**
 * Predict step. x' = F x ; P' = F P F^T + Q.
 *
 * Q assumes piecewise-constant white acceleration noise:
 *   Q = sigma_a^2 * | dt^4/4   0       dt^3/2  0      |
 *                   | 0        dt^4/4  0       dt^3/2 |
 *                   | dt^3/2   0       dt^2    0      |
 *                   | 0        dt^3/2  0       dt^2   |
 *
 * dt is clamped to [0, 60s] - longer gaps are handled by re-init in
 * the caller because the constant-velocity assumption breaks down.
 */
export function predictKalman2D(
  state: KalmanState2D,
  dtSeconds: number,
  accelSigma: number = DEFAULT_ACCEL_SIGMA,
): KalmanState2D {
  const dt = Math.max(0, Math.min(dtSeconds, 60));
  const newLng = state.lng + state.vlng * dt;
  const newLat = state.lat + state.vlat * dt;

  // P' = F P F^T + Q. F is sparse so we compute the relevant entries
  // by hand instead of full matrix multiplication.
  const p = state.covariance;
  const sigma2 = accelSigma * accelSigma;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  const q00 = (sigma2 * dt4) / 4;
  const q02 = (sigma2 * dt3) / 2;
  const q22 = sigma2 * dt2;

  // F P F^T with F = [[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]]
  // Indices below follow row-major flattening.
  const p00 = p[0]!;
  const p02 = p[2]!;
  const p20 = p[8]!;
  const p22 = p[10]!;
  const p11 = p[5]!;
  const p13 = p[7]!;
  const p31 = p[13]!;
  const p33 = p[15]!;

  const newCov = new Array<number>(STATE_DIM * STATE_DIM).fill(0);
  // lng-lng block (rows 0,2 cols 0,2)
  newCov[0] = p00 + dt * (p02 + p20) + dt2 * p22 + q00;
  newCov[2] = p02 + dt * p22 + q02;
  newCov[8] = p20 + dt * p22 + q02;
  newCov[10] = p22 + q22;
  // lat-lat block (rows 1,3 cols 1,3)
  newCov[5] = p11 + dt * (p13 + p31) + dt2 * p33 + q00;
  newCov[7] = p13 + dt * p33 + q02;
  newCov[13] = p31 + dt * p33 + q02;
  newCov[15] = p33 + q22;

  return {
    lng: newLng,
    lat: newLat,
    vlng: state.vlng,
    vlat: state.vlat,
    covariance: newCov,
  };
}

/**
 * Update step with a position measurement.
 *
 *   y = z - H x    (innovation)
 *   S = H P H^T + R
 *   K = P H^T S^-1
 *   x' = x + K y
 *   P' = (I - K H) P
 *
 * H = [[1,0,0,0],[0,1,0,0]] so H P H^T is the top-left 2x2 of P plus R.
 * S is 2x2, inverted by hand.
 */
export function updateKalman2D(
  state: KalmanState2D,
  measurementLng: number,
  measurementLat: number,
  measurementSigma: number = DEFAULT_MEASUREMENT_SIGMA,
): KalmanState2D {
  const p = state.covariance;
  const r = measurementSigma * measurementSigma;

  // S = H P H^T + R. H selects the position rows / columns so this is
  // just the top-left 2x2 of P plus diag(r, r).
  const s00 = p[0]! + r;
  const s01 = p[1]!;
  const s10 = p[matIndex(1, 0)]!;
  const s11 = p[5]! + r;
  const det = s00 * s11 - s01 * s10;
  if (det === 0) {
    // Degenerate - skip the update, return predicted state.
    return state;
  }
  const sInv00 = s11 / det;
  const sInv01 = -s01 / det;
  const sInv10 = -s10 / det;
  const sInv11 = s00 / det;

  // K = P H^T S^-1. P H^T is the first two columns of P (4x2).
  const pHt: number[][] = [
    [p[0]!, p[1]!],
    [p[4]!, p[5]!],
    [p[8]!, p[9]!],
    [p[12]!, p[13]!],
  ];
  const k: number[][] = pHt.map(row => [
    row[0]! * sInv00 + row[1]! * sInv10,
    row[0]! * sInv01 + row[1]! * sInv11,
  ]);

  // Innovation y = z - H x = z - [lng, lat]
  const yLng = measurementLng - state.lng;
  const yLat = measurementLat - state.lat;

  const newLng = state.lng + k[0]![0]! * yLng + k[0]![1]! * yLat;
  const newLat = state.lat + k[1]![0]! * yLng + k[1]![1]! * yLat;
  const newVlng = state.vlng + k[2]![0]! * yLng + k[2]![1]! * yLat;
  const newVlat = state.vlat + k[3]![0]! * yLng + k[3]![1]! * yLat;

  // P' = (I - K H) P. K H is 4x4 with the velocity-rows of K in the
  // top 2 columns and zeros elsewhere; subtracting from I and right-
  // multiplying by P yields the new covariance via row-mixing.
  const newCov = new Array<number>(STATE_DIM * STATE_DIM).fill(0);
  for (let row = 0; row < STATE_DIM; row += 1) {
    const k0 = k[row]![0]!;
    const k1 = k[row]![1]!;
    for (let col = 0; col < STATE_DIM; col += 1) {
      // (I - K H)_{row, j} P_{j, col}
      // I - K H has 1 on the diagonal, -k0 in column 0 (for non-row=0)
      // and -k1 in column 1 (for non-row=1).
      const ikh0 = (row === 0 ? 1 : 0) - k0; // (I - K H)_{row, 0}
      const ikh1 = (row === 1 ? 1 : 0) - k1; // (I - K H)_{row, 1}
      const ikh2 = row === 2 ? 1 : 0;
      const ikh3 = row === 3 ? 1 : 0;
      newCov[matIndex(row, col)] =
        ikh0 * p[matIndex(0, col)]! +
        ikh1 * p[matIndex(1, col)]! +
        ikh2 * p[matIndex(2, col)]! +
        ikh3 * p[matIndex(3, col)]!;
    }
  }

  return {
    lng: newLng,
    lat: newLat,
    vlng: newVlng,
    vlat: newVlat,
    covariance: newCov,
  };
}

/**
 * Single-shot convenience: predict to the measurement time then update.
 * Most call sites only need this; predict / update are separately
 * exported for callers that need to project forward without consuming
 * a measurement (FE smoothing render tick between AIS reports).
 */
export function stepKalman2D(
  state: KalmanState2D,
  dtSeconds: number,
  measurementLng: number,
  measurementLat: number,
  accelSigma: number = DEFAULT_ACCEL_SIGMA,
  measurementSigma: number = DEFAULT_MEASUREMENT_SIGMA,
): KalmanState2D {
  const predicted = predictKalman2D(state, dtSeconds, accelSigma);
  return updateKalman2D(predicted, measurementLng, measurementLat, measurementSigma);
}
