import { TokenBucket } from '../sources/token-bucket';

/**
 * Globally caps the rate at which previously-unseen MMSIs can enter
 * the pipeline.
 *
 * A flooder spreading load across thousands of unique fake MMSIs at
 * 1 frame/sec each would slip past the per-MMSI rate limiter (each
 * MMSI sits comfortably under its 1/sec budget). This bouncer adds a
 * second wall: a global TokenBucket whose budget is consumed only by
 * a frame whose MMSI has not been seen recently.
 *
 * Implementation:
 *   - Known MMSIs are tracked in an LRU set with a generous cap so
 *     real ports (rarely more than 500 vessels) never get bounced.
 *   - When a frame arrives with an MMSI not in the set, a token is
 *     consumed from the introductions bucket. If the bucket is empty,
 *     the frame is dropped (logged to DLQ).
 *   - Frames whose MMSI is already known pass through this layer
 *     without spending tokens.
 *
 * Defaults: 100 introductions/min sustained, burst capacity 200.
 * Tracked MMSI cap 10000 (well above natural port traffic).
 */

const DEFAULT_INTRODUCTIONS_CAPACITY = 200;
const DEFAULT_INTRODUCTIONS_PER_SECOND = 100 / 60;
const DEFAULT_TRACKED_MMSI_LIMIT = 10_000;

export type NewMmsiBouncerOptions = {
  readonly introductionsCapacity?: number;
  readonly introductionsPerSecond?: number;
  readonly trackedMmsiLimit?: number;
  readonly now?: () => number;
};

export type NewMmsiBouncerStats = {
  readonly known: number;
  readonly introductionsAdmitted: number;
  readonly introductionsRejected: number;
};

export type AdmitOutcome =
  | 'admitted-known'
  | 'admitted-new'
  | 'rejected-new-cap';

export class NewMmsiBouncer {
  private readonly bucket: TokenBucket;
  private readonly trackedMmsiLimit: number;
  private readonly knownMmsis = new Map<number, true>();
  private introductionsAdmitted = 0;
  private introductionsRejected = 0;

  constructor(options: NewMmsiBouncerOptions = {}) {
    this.bucket = new TokenBucket({
      capacity: options.introductionsCapacity ?? DEFAULT_INTRODUCTIONS_CAPACITY,
      refillPerSecond:
        options.introductionsPerSecond ?? DEFAULT_INTRODUCTIONS_PER_SECOND,
      now: options.now,
    });
    this.trackedMmsiLimit =
      options.trackedMmsiLimit ?? DEFAULT_TRACKED_MMSI_LIMIT;
  }

  admit(mmsi: number): AdmitOutcome {
    const existing = this.knownMmsis.get(mmsi);
    if (existing !== undefined) {
      this.knownMmsis.delete(mmsi);
      this.knownMmsis.set(mmsi, true);
      return 'admitted-known';
    }
    if (!this.bucket.tryConsume()) {
      this.introductionsRejected += 1;
      return 'rejected-new-cap';
    }
    if (this.knownMmsis.size >= this.trackedMmsiLimit) {
      const iter = this.knownMmsis.keys().next();
      if (!iter.done) this.knownMmsis.delete(iter.value);
    }
    this.knownMmsis.set(mmsi, true);
    this.introductionsAdmitted += 1;
    return 'admitted-new';
  }

  stats(): NewMmsiBouncerStats {
    return {
      known: this.knownMmsis.size,
      introductionsAdmitted: this.introductionsAdmitted,
      introductionsRejected: this.introductionsRejected,
    };
  }

  /** Test hook. */
  reset(): void {
    this.knownMmsis.clear();
    this.introductionsAdmitted = 0;
    this.introductionsRejected = 0;
  }
}
