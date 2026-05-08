import { TokenBucket } from './token-bucket';

function makeClock(initial = 0): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let current = initial;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('TokenBucket', () => {
  it('starts at full capacity', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 200,
      refillPerSecond: 200,
      now: clock.now,
    });
    expect(bucket.available()).toBe(200);
  });

  it('consumes one token per tryConsume', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 5,
      refillPerSecond: 1,
      now: clock.now,
    });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.available()).toBe(3);
  });

  it('rejects when bucket is empty', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 2,
      refillPerSecond: 1,
      now: clock.now,
    });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills at the configured rate', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 10,
      refillPerSecond: 100,
      now: clock.now,
    });
    for (let i = 0; i < 10; i += 1) bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);
    clock.advance(50);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('caps at capacity even after long idle', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 200,
      refillPerSecond: 200,
      now: clock.now,
    });
    clock.advance(60_000);
    expect(bucket.available()).toBe(200);
  });

  it('limits sustained throughput to the refill rate after the initial burst', () => {
    const clock = makeClock();
    const bucket = new TokenBucket({
      capacity: 200,
      refillPerSecond: 200,
      now: clock.now,
    });
    for (let i = 0; i < 200; i += 1) bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);

    let accepted = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (bucket.tryConsume()) accepted += 1;
      clock.advance(2);
    }
    expect(accepted).toBeGreaterThanOrEqual(380);
    expect(accepted).toBeLessThanOrEqual(420);
  });

  it('rejects invalid construction', () => {
    expect(
      () => new TokenBucket({ capacity: 0, refillPerSecond: 1 }),
    ).toThrow();
    expect(
      () => new TokenBucket({ capacity: 1, refillPerSecond: 0 }),
    ).toThrow();
    expect(
      () => new TokenBucket({ capacity: -1, refillPerSecond: 1 }),
    ).toThrow();
  });
});
