export type SourceId = 'local-udp' | 'web-sdr' | 'ais-stream';

export interface NmeaFrame {
  readonly raw: string;
  readonly receivedAt: number;
  readonly sourceId: SourceId;
}

export type Unsubscribe = () => void;

export interface ISource {
  readonly id: SourceId;
  readonly priority: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  onFrame(callback: (frame: NmeaFrame) => void): Unsubscribe;
  onError(callback: (error: Error) => void): Unsubscribe;
}

export type IngestStatus =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'degraded'
  | 'switching'
  | 'exhausted';

export type FrameRejectionReason = 'bad-checksum' | 'rate-limit';

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

export const HEALTHY_WINDOW_MS = 30_000;
export const DEGRADED_GRACE_MS = 30_000;
export const EXHAUSTED_RETRY_MS = 60_000;
