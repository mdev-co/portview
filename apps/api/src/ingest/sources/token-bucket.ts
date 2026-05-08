export interface TokenBucketOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
  readonly now?: () => number;
}

/**
 * Standard token bucket. Constant-time `tryConsume`, with a clock
 * injection point so tests can advance time without sleeping.
 */
export class TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillAt: number;

  constructor(options: TokenBucketOptions) {
    if (options.capacity <= 0) {
      throw new Error('TokenBucket capacity must be positive');
    }
    if (options.refillPerSecond <= 0) {
      throw new Error('TokenBucket refillPerSecond must be positive');
    }
    this.capacity = options.capacity;
    this.refillPerMs = options.refillPerSecond / 1000;
    this.now = options.now ?? Date.now;
    this.tokens = options.capacity;
    this.lastRefillAt = this.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = this.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerMs,
    );
    this.lastRefillAt = now;
  }
}
