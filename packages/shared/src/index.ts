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
  type SourceStats,
  type Unsubscribe,
} from './machines/ingest-source.types';

export { isValidNmea, validateNmeaChecksum, type ChecksumResult } from './parsers/nmea-checksum';

export { BitReader, aisCharFromBits, payloadToBits, sixbitFromChar } from './parsers/ais-bits';

export type { LngLat, LngLatBounds } from './types/geo';
export type { PositionReport } from './types/vessel';

export {
  decodePositionReport,
  NotAPositionReportError,
  PositionReportTooShortError,
} from './parsers/ais-position';
