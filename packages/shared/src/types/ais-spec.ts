/**
 * Shared ITU-R M.1371-5 AIS spec constants. The values below are
 * upstream-defined; do not invent new ones here. Each constant has a
 * short cite to the relevant section so future-me can audit.
 *
 * Constants live in @sps/shared because the parsers, validators, JSON
 * adapter and frame builder all need to agree on the same upstream
 * vocabulary. Diverging defaults across modules has produced data
 * corruption bugs in similar codebases (see ADR-0006 on data integrity).
 */

/**
 * ITU-R M.1371-5 §3.1: NavStatus values. The full enum is documented in
 * the spec; constants below cover the values the SPS pipeline branches
 * on. Values not listed here are passed through verbatim.
 */
export const AIS_NAV_STATUS_UNDER_WAY_USING_ENGINE = 0;
export const AIS_NAV_STATUS_AT_ANCHOR = 1;
export const AIS_NAV_STATUS_NOT_UNDER_COMMAND = 2;
export const AIS_NAV_STATUS_RESTRICTED_MANEUVERABILITY = 3;
export const AIS_NAV_STATUS_CONSTRAINED_BY_DRAUGHT = 4;
export const AIS_NAV_STATUS_MOORED = 5;
export const AIS_NAV_STATUS_AGROUND = 6;
export const AIS_NAV_STATUS_ENGAGED_IN_FISHING = 7;
export const AIS_NAV_STATUS_UNDER_WAY_SAILING = 8;
export const AIS_NAV_STATUS_UNKNOWN = 15;

/** ITU-R M.1371-5 §3.1: repeatIndicator 0 = "default, no repeat". */
export const AIS_REPEAT_INDICATOR_DEFAULT = 0;

/** ITU-R M.1371-5 §3.1: maneuverIndicator 0 = "not available". */
export const AIS_MANEUVER_INDICATOR_DEFAULT = 0;

/** ITU-R M.1371-5: radio comm state 0 is the safe default. */
export const AIS_RADIO_STATUS_DEFAULT = 0;

/** ITU-R M.1371-5: aisVersion 0 = original 1371. */
export const AIS_VERSION_DEFAULT = 0;

/** ITU-R M.1371-5: EPFD type 0 = undefined. */
export const AIS_EPFD_TYPE_DEFAULT = 0;

/** ITU-R M.1371-5: shipType 0 = "not available". */
export const AIS_SHIP_TYPE_DEFAULT = 0;

/**
 * MMSI is a 9-digit identifier; the first 3 digits are the MID
 * (Maritime Identification Digits) per ITU-R M.585. MID 200..799
 * identifies a real flag state; values outside the range are auxiliary
 * services (SAR aircraft 111, AIS-SART 970-974, MOB 972, EPIRB 974).
 */
export const MMSI_MID_DIVISOR = 1_000_000;
export const MMSI_MID_MIN = 200;
export const MMSI_MID_MAX = 799;

/**
 * Rate-of-turn sentinel band per ITU-R M.1371-5 §3.3.8.2.3.
 *   raw 0     : not turning
 *   raw ±1..126 : turning at calculated rate
 *   raw ±127  : turning > 720 deg/min (exact rate not derivable)
 *   raw -128  : not available
 *
 * We treat |raw| >= 127.5 as "rate not derivable" (returns null at the
 * boundary) since the codec cannot represent the >720 deg/min state
 * meaningfully in the FE.
 */
export const AIS_RATE_OF_TURN_UNKNOWN_SENTINEL = -128;
export const AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND = 127.5;

/** ITU-R M.1371-5 §3.3.8.2.4: Sog raw 1023 (= 102.3 kn) = unknown. */
export const AIS_SOG_UNKNOWN_THRESHOLD = 102.3;

/** ITU-R M.1371-5 §3.3.8.2.5: Cog 360 = unknown (compass wraps at 360). */
export const AIS_COG_UNKNOWN_SENTINEL = 360;

/** ITU-R M.1371-5 §3.3.8.2.6: TrueHeading 511 = unknown. */
export const AIS_HEADING_UNKNOWN_SENTINEL = 511;

/** ITU-R M.1371-5: latitude 91 / longitude 181 = unknown (out-of-range). */
export const AIS_LAT_UNKNOWN_SENTINEL = 91;
export const AIS_LNG_UNKNOWN_SENTINEL = 181;

/**
 * AIS message types the SPS pipeline supports. Numbering is
 * non-sequential because the ITU-R 1371 spec has accumulated message
 * types over five revisions; SPS handles the subset that covers ~95%
 * of commercial port traffic.
 *
 *   1, 2, 3 : Class A position report (scheduled / assigned /
 *             interrogation response — same payload, different cause).
 *   5       : Static and voyage data (vessel name, IMO, dimensions,
 *             ETA, draught, destination).
 *   18      : Class B position report (smaller vessels, yachts,
 *             fishing boats — sparser fields than Class A).
 *
 * Other types in the spec (4 base station, 6-17 binary/safety, 19-24
 * extended Class B) reach the DLQ as `unsupported-message-type`. A
 * future build that needs them adds a parser + validator branch and a
 * literal here.
 */
export const SUPPORTED_AIS_MESSAGE_TYPES = [1, 2, 3, 5, 18] as const;
export type SupportedAisMessageType = (typeof SUPPORTED_AIS_MESSAGE_TYPES)[number];
