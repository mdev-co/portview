export { createLogger, type AppLogger, type CreateLoggerOptions } from './logger';

export { type Mmsi, type Imo, type ShipTypeCode, SourceId, sourceIdName } from './types/brands';

export {
  AIS_NAV_STATUS_UNDER_WAY_USING_ENGINE,
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_NOT_UNDER_COMMAND,
  AIS_NAV_STATUS_RESTRICTED_MANEUVERABILITY,
  AIS_NAV_STATUS_CONSTRAINED_BY_DRAUGHT,
  AIS_NAV_STATUS_MOORED,
  AIS_NAV_STATUS_AGROUND,
  AIS_NAV_STATUS_ENGAGED_IN_FISHING,
  AIS_NAV_STATUS_UNDER_WAY_SAILING,
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
  isValidShipType,
  parseShipType,
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
export { VESSEL_STATIC_FRAME_KIND, type VesselStaticDataFrame } from './types/vessel-static';
export {
  SHIP_TYPE_BANDS,
  SHIP_TYPE_CATEGORIES,
  shipCategoryLabel,
  type ShipTypeBand,
  type ShipTypeCategory,
  shipTypeCategory,
  shipTypeLabel,
} from './enums/ship-type';
export type { ClassBPositionReport } from './types/class-b-position';
export {
  CLASS_B_STATIC_PART_A,
  CLASS_B_STATIC_PART_B,
  type ClassBStaticData,
  type ClassBStaticPart,
} from './types/class-b-static';
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

export {
  decodeClassBStaticData,
  NotClassBStaticError,
  ClassBStaticTooShortError,
} from './parsers/ais-class-b-static';

export { type AivdmEnvelope, AivdmParseError, parseAivdmEnvelope } from './parsers/aivdm-envelope';

export {
  AisMultipartReassembler,
  type AisMultipartReassemblerOptions,
  type AssembledPayload,
} from './parsers/ais-multipart';
