export { createLogger, type AppLogger, type CreateLoggerOptions } from './logger';

export { type Mmsi, type Imo, SourceId, sourceIdName } from './types/brands';

export {
  AIS_NAV_STATUS_UNKNOWN,
  AIS_REPEAT_INDICATOR_DEFAULT,
  AIS_MANEUVER_INDICATOR_DEFAULT,
  AIS_RADIO_STATUS_DEFAULT,
  AIS_VERSION_DEFAULT,
  AIS_EPFD_TYPE_DEFAULT,
  AIS_SHIP_TYPE_DEFAULT,
  MMSI_MID_DIVISOR,
  MMSI_MID_MIN,
  MMSI_MID_MAX,
  AIS_RATE_OF_TURN_UNKNOWN_SENTINEL,
  AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND,
  AIS_SOG_UNKNOWN_THRESHOLD,
  AIS_COG_UNKNOWN_SENTINEL,
  AIS_HEADING_UNKNOWN_SENTINEL,
  AIS_LAT_UNKNOWN_SENTINEL,
  AIS_LNG_UNKNOWN_SENTINEL,
  SUPPORTED_AIS_MESSAGE_TYPES,
  type SupportedAisMessageType,
} from './types/ais-spec';

export {
  LeDataView,
  VESSEL_FRAME_BYTES,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  type VesselUpdateFrame,
  decodeVesselFrame,
  encodeVesselFrame,
} from './codecs';

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
