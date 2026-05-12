import { TokenBucket } from '../sources/token-bucket';

/**
 * Per-MMSI rate limiter for the ingest pipeline.
 *
 * AIS Class A vessels broadcast position reports every 2-10 seconds.
 * Class B broadcast every 3-30 seconds depending on speed. A single
 * MMSI sending more than ~1 frame/second is either malfunctioning or
 * a spoof.
 *
 * Implementation: LRU map of TokenBucket, keyed by MMSI. Each bucket
 * permits a small burst (capacity 5) and refills at 1 token/sec so the
 * steady-state cap is 1 frame/sec per MMSI. When the map reaches its
 * size cap, the least-recently-seen MMSI is evicted - that vessel can
 * still send frames; it simply gets a fresh bucket allocated.
 *
 * The LRU cap (10000) bounds total memory: ~10000 * (TokenBucket size)
 * is on the order of tens of MB worst case. Real ports rarely show
 * more than 200-500 active vessels, so the cap is far above natural
 * traffic and reads as a flood-protection threshold rather than a
 * normal-traffic ceiling.
 */

const DEFAULT_PER_MMSI_CAPACITY = 5;
const DEFAULT_PER_MMSI_REFILL_PER_SECOND = 1;
const DEFAULT_TRACKED_MMSI_LIMIT = 10_000;

export type PerMmsiRateLimiterOptions = {
  readonly capacityPerMmsi?: number;
  readonly refillPerSecondPerMmsi?: number;
  readonly trackedMmsiLimit?: number;
  readonly now?: () => number;
};

export type PerMmsiRateLimiterStats = {
  readonly tracked: number;
  readonly evictions: number;
  readonly drops: number;
};

export class PerMmsiRateLimiter {
  private readonly capacityPerMmsi: number;
  private readonly refillPerSecondPerMmsi: number;
  private readonly trackedMmsiLimit: number;
  private readonly now: () => number;
  private readonly buckets = new Map<number, TokenBucket>();
  private evictions = 0;
  private drops = 0;

  constructor(options: PerMmsiRateLimiterOptions = {}) {
    this.capacityPerMmsi = options.capacityPerMmsi ?? DEFAULT_PER_MMSI_CAPACITY;
    this.refillPerSecondPerMmsi =
      options.refillPerSecondPerMmsi ?? DEFAULT_PER_MMSI_REFILL_PER_SECOND;
    this.trackedMmsiLimit =
      options.trackedMmsiLimit ?? DEFAULT_TRACKED_MMSI_LIMIT;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns true if the MMSI has tokens available. Increments the
   * internal LRU recency for this MMSI on every call. Returns false
   * if the bucket is exhausted; the caller is expected to drop the
   * frame and log to DLQ.
   */
  tryConsume(mmsi: number): boolean {
    const existing = this.buckets.get(mmsi);
    if (existing !== undefined) {
      // Re-insert to bump recency in the Map (Map preserves insertion order).
      this.buckets.delete(mmsi);
      this.buckets.set(mmsi, existing);
      if (existing.tryConsume()) return true;
      this.drops += 1;
      return false;
    }
    if (this.buckets.size >= this.trackedMmsiLimit) {
      // Evict LRU.
      const iter = this.buckets.keys().next();
      if (!iter.done) {
        this.buckets.delete(iter.value);
        this.evictions += 1;
      }
    }
    const fresh = new TokenBucket({
      capacity: this.capacityPerMmsi,
      refillPerSecond: this.refillPerSecondPerMmsi,
      now: this.now,
    });
    const ok = fresh.tryConsume();
    this.buckets.set(mmsi, fresh);
    if (!ok) this.drops += 1;
    return ok;
  }

  stats(): PerMmsiRateLimiterStats {
    return {
      tracked: this.buckets.size,
      evictions: this.evictions,
      drops: this.drops,
    };
  }

  /** Test hook: clear all buckets. */
  reset(): void {
    this.buckets.clear();
    this.evictions = 0;
    this.drops = 0;
  }
}
