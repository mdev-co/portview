import { describe, expect, it } from 'vitest';
import {
  initKalmanState2D,
  predictKalman2D,
  stepKalman2D,
  updateKalman2D,
} from '../kalman-filter-2d';

describe('initKalmanState2D', () => {
  it('snaps position to the first measurement and starts at rest', () => {
    const s = initKalmanState2D(14.55, 53.42);
    expect(s.lng).toBeCloseTo(14.55, 6);
    expect(s.lat).toBeCloseTo(53.42, 6);
    expect(s.vlng).toBe(0);
    expect(s.vlat).toBe(0);
  });

  it('produces a 4x4 covariance with non-zero diagonal and zero off-diagonal', () => {
    const s = initKalmanState2D(0, 0);
    expect(s.covariance).toHaveLength(16);
    expect(s.covariance[0]).toBeGreaterThan(0);
    expect(s.covariance[5]).toBeGreaterThan(0);
    expect(s.covariance[10]).toBeGreaterThan(0);
    expect(s.covariance[15]).toBeGreaterThan(0);
    expect(s.covariance[1]).toBe(0);
    expect(s.covariance[6]).toBe(0);
    expect(s.covariance[11]).toBe(0);
  });
});

describe('predictKalman2D', () => {
  it('propagates position by velocity * dt', () => {
    const init = initKalmanState2D(14, 53);
    const moving = { ...init, vlng: 0.001, vlat: -0.0005 };
    const predicted = predictKalman2D(moving, 10);
    expect(predicted.lng).toBeCloseTo(14 + 0.001 * 10, 6);
    expect(predicted.lat).toBeCloseTo(53 - 0.0005 * 10, 6);
    expect(predicted.vlng).toBe(moving.vlng);
    expect(predicted.vlat).toBe(moving.vlat);
  });

  it('grows position uncertainty over time', () => {
    const init = initKalmanState2D(14, 53);
    const after1 = predictKalman2D(init, 1);
    const after10 = predictKalman2D(init, 10);
    expect(after10.covariance[0]!).toBeGreaterThan(after1.covariance[0]!);
    expect(after10.covariance[5]!).toBeGreaterThan(after1.covariance[5]!);
  });

  it('clamps very long dt to avoid unrealistic projection', () => {
    const init = initKalmanState2D(14, 53);
    const moving = { ...init, vlng: 0.001, vlat: 0 };
    const projectedLong = predictKalman2D(moving, 600);
    // Internally clamped to 60s -> 0.06 deg max projection.
    expect(projectedLong.lng - 14).toBeLessThanOrEqual(0.06 + 1e-9);
  });
});

describe('updateKalman2D', () => {
  it('pulls position toward the measurement', () => {
    const init = initKalmanState2D(14, 53);
    const updated = updateKalman2D(init, 14.01, 53.01);
    expect(updated.lng).toBeGreaterThan(14);
    expect(updated.lng).toBeLessThanOrEqual(14.01);
    expect(updated.lat).toBeGreaterThan(53);
    expect(updated.lat).toBeLessThanOrEqual(53.01);
  });

  it('shrinks position covariance after an update', () => {
    const init = initKalmanState2D(14, 53);
    const updated = updateKalman2D(init, 14.01, 53.01);
    expect(updated.covariance[0]!).toBeLessThan(init.covariance[0]!);
    expect(updated.covariance[5]!).toBeLessThan(init.covariance[5]!);
  });
});

describe('stepKalman2D - sequence convergence', () => {
  it('estimates a non-zero velocity from a sequence of moving measurements', () => {
    // Vessel moves east at 0.0001 deg/s for 10 reports, 1 s apart.
    let state = initKalmanState2D(14, 53);
    const truthVlng = 0.0001;
    for (let i = 1; i <= 10; i += 1) {
      const measLng = 14 + truthVlng * i;
      state = stepKalman2D(state, 1, measLng, 53);
    }
    // Filter should pick up roughly the truth velocity. Loose bound:
    // converges within a factor of 2 in 10 steps with the default
    // tuning.
    expect(state.vlng).toBeGreaterThan(truthVlng * 0.4);
    expect(state.vlng).toBeLessThan(truthVlng * 1.6);
    // Kalman is a smoother, so the filtered position lags the latest
    // raw measurement. After 10 samples it sits well past the origin
    // but not past the latest measurement; that is enough convergence
    // for the downstream snapshot consumer.
    const latestMeasurement = 14 + truthVlng * 10;
    expect(state.lng).toBeGreaterThan(14);
    expect(state.lng).toBeLessThanOrEqual(latestMeasurement);
  });

  it('keeps velocity near zero for a stationary vessel jittering on GPS noise', () => {
    let state = initKalmanState2D(14, 53);
    const noiseSeq = [0.000005, -0.000004, 0.000003, -0.000002, 0.000001];
    for (let i = 0; i < noiseSeq.length; i += 1) {
      state = stepKalman2D(state, 1, 14 + noiseSeq[i]!, 53 + noiseSeq[i]!);
    }
    // Velocity stays small compared to a real-vessel speed (0.0001).
    expect(Math.abs(state.vlng)).toBeLessThan(0.00005);
    expect(Math.abs(state.vlat)).toBeLessThan(0.00005);
  });
});
