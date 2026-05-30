import { SourceId } from '../types/brands';

export { SourceId };

export interface NmeaFrame {
  readonly raw: string;
  readonly receivedAt: number;
  readonly sourceId: SourceId;
}

export type Unsubscribe = () => void;

export type SourceStats = Readonly<Record<string, number>>;

export interface ISource {
  readonly id: SourceId;
  readonly priority: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  onFrame(callback: (frame: NmeaFrame) => void): Unsubscribe;
  onError(callback: (error: Error) => void): Unsubscribe;
  getStats?(): SourceStats;
}

export type IngestStatus =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'degraded'
  | 'switching'
  | 'exhausted';

export type FrameRejectionReason =
  | 'bad-checksum'
  | 'rate-limit'
  | 'parse-error'
  | 'unsupported-message-type'
  | 'invalid-mmsi'
  | 'invalid-imo'
  | 'invalid-ship-type'
  | 'out-of-range-lat'
  | 'out-of-range-lng'
  | 'malformed-json'
  | 'missing-message'
  | 'unsupported-payload'
  | 'invalid-payload';

export interface IngestContext {
  readonly prioritizedSourceIds: readonly SourceId[];
  currentSourceId: SourceId | null;
  triedSourceIds: readonly SourceId[];
  lastFrameAt: number | null;
  framesAccepted: number;
  framesRejected: number;
  errorMessage: string | null;
}

export type IngestEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'SOURCE_CONNECTED'; sourceId: SourceId }
  | { type: 'SOURCE_FAILED'; sourceId: SourceId; reason: string }
  | { type: 'FRAME_RECEIVED'; sourceId: SourceId; frameAt: number }
  | { type: 'FRAME_REJECTED'; sourceId: SourceId; reason: FrameRejectionReason };

export interface IngestActorInput {
  readonly prioritizedSourceIds: readonly SourceId[];
}

/**
 * Time without a FRAME_RECEIVED event after which an active source is
 * downgraded to "degraded". AIS traffic from passive receivers (LocalUdp,
 * EdgeBridge) is inherently bursty: a quiet port can produce one position
 * report every few minutes, so a tight 30 s window flips the FSM constantly
 * and triggers premature failover. Five minutes covers realistic AIS pauses
 * for a single-vessel-in-sight scenario.
 */
export const HEALTHY_WINDOW_MS = 300_000;

/**
 * Time the FSM waits in "degraded" before switching to the next source.
 * Doubled compared to HEALTHY_WINDOW_MS so that a single noisy interval
 * does not throw away an otherwise functional source.
 */
export const DEGRADED_GRACE_MS = 600_000;

/**
 * Time in "exhausted" before retrying from the highest-priority source.
 */
export const EXHAUSTED_RETRY_MS = 60_000;
