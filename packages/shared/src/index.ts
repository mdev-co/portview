export { createLogger, type AppLogger, type CreateLoggerOptions } from './logger';

export { ingestSourceMachine } from './machines/ingest-source-machine';
export {
  DEGRADED_GRACE_MS,
  EXHAUSTED_RETRY_MS,
  HEALTHY_WINDOW_MS,
  type FrameRejectionReason,
  type IngestActorInput,
  type IngestContext,
  type IngestEvent,
  type IngestStatus,
  type ISource,
  type NmeaFrame,
  type SourceId,
  type Unsubscribe,
} from './machines/ingest-source.types';

export { isValidNmea, validateNmeaChecksum, type ChecksumResult } from './parsers/nmea-checksum';
