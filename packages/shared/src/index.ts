export { createLogger, type AppLogger, type CreateLoggerOptions } from './logger';

export { type Mmsi, type Imo, SourceId, sourceIdName } from './types/brands';

export {
  type RejectReason,
  type Result,
  err,
  ok,
  isValidMmsi,
  parseMmsi,
  isValidImo,
  parseImo,
  isValidLatLng,
  validateLatLng,
  validateAisMessage,
} from './validators';

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
  type SourceStats,
  type Unsubscribe,
} from './machines/ingest-source.types';

export { isValidNmea, validateNmeaChecksum, type ChecksumResult } from './parsers/nmea-checksum';

export { BitReader, aisCharFromBits, payloadToBits, sixbitFromChar } from './parsers/ais-bits';

export type { LngLat, LngLatBounds } from './types/geo';
export type { PositionReport } from './types/vessel';
export type { StaticData, StaticDimensions, StaticEta } from './types/static-data';
export type { ClassBPositionReport } from './types/class-b-position';
export type { AisMessage, AisMessageType } from './types/ais-message';

export {
  decodePositionReport,
  NotAPositionReportError,
  PositionReportTooShortError,
} from './parsers/ais-position';

export {
  decodeStaticData,
  NotStaticDataError,
  StaticDataTooShortError,
} from './parsers/ais-static-data';

export {
  decodeClassBPositionReport,
  NotClassBPositionError,
  ClassBPositionTooShortError,
} from './parsers/ais-class-b-position';

export { type AivdmEnvelope, AivdmParseError, parseAivdmEnvelope } from './parsers/aivdm-envelope';

export {
  AisMultipartReassembler,
  type AisMultipartReassemblerOptions,
  type AssembledPayload,
} from './parsers/ais-multipart';
