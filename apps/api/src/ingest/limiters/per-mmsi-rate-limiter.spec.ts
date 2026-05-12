import { PerMmsiRateLimiter } from './per-mmsi-rate-limiter';

describe('PerMmsiRateLimiter', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('admits a single MMSI up to bucket capacity then rejects', () => {
    const limiter = new PerMmsiRateLimiter({
      capacityPerMmsi: 3,
      refillPerSecondPerMmsi: 1,
      now: clock,
    });

    expect(limiter.tryConsume(261_000_001)).toBe(true);
    expect(limiter.tryConsume(261_000_001)).toBe(true);
    expect(limiter.tryConsume(261_000_001)).toBe(true);
    expect(limiter.tryConsume(261_000_001)).toBe(false);
  });

  it('refills bucket over time', () => {
    const limiter = new PerMmsiRateLimiter({
      capacityPerMmsi: 1,
      refillPerSecondPerMmsi: 1,
      now: clock,
    });

    expect(limiter.tryConsume(261_000_001)).toBe(true);
    expect(limiter.tryConsume(261_000_001)).toBe(false);
    now += 1_500;
    expect(limiter.tryConsume(261_000_001)).toBe(true);
  });

  it('keeps separate budgets per MMSI', () => {
    const limiter = new PerMmsiRateLimiter({
      capacityPerMmsi: 1,
      refillPerSecondPerMmsi: 1,
      now: clock,
    });

    expect(limiter.tryConsume(261_000_001)).toBe(true);
    expect(limiter.tryConsume(261_000_002)).toBe(true);
    expect(limiter.tryConsume(261_000_001)).toBe(false);
    expect(limiter.tryConsume(261_000_002)).toBe(false);
  });

  it('evicts least-recently-seen MMSI when tracked cap reached', () => {
    const limiter = new PerMmsiRateLimiter({
      capacityPerMmsi: 1,
      refillPerSecondPerMmsi: 1,
      trackedMmsiLimit: 2,
      now: clock,
    });

    limiter.tryConsume(1);
    limiter.tryConsume(2);
    limiter.tryConsume(3);

    const stats = limiter.stats();
    expect(stats.evictions).toBe(1);
    expect(stats.tracked).toBe(2);
  });

  it('counts drops in stats', () => {
    const limiter = new PerMmsiRateLimiter({
      capacityPerMmsi: 1,
      refillPerSecondPerMmsi: 1,
      now: clock,
    });

    limiter.tryConsume(1);
    limiter.tryConsume(1);
    limiter.tryConsume(1);

    expect(limiter.stats().drops).toBe(2);
  });
});
