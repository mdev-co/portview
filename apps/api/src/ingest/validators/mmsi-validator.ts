/**
 * MMSI sanity check at the ingest boundary.
 *
 * AIS MMSI is a 9-digit identifier defined by ITU-R M.585. The first
 * three digits encode the country (MID, Maritime Identification Digits)
 * and fall in the range 201-775 for assigned countries. Values outside
 * 100_000_000-999_999_999 are spec-invalid; values whose MID is outside
 * the assigned range are either malformed or impersonation attempts
 * (e.g. flooders using 000_000_001 or 999_999_999).
 *
 * Special prefixes (00 / 0 / 111 ...) identify auxiliary stations,
 * SAR aircraft, search-and-rescue transponders, AtoN, etc. Those are
 * accepted as valid MMSI here because they appear in legitimate live
 * traffic; the goal of this validator is to reject obvious garbage
 * before it reaches persistence and the WebSocket fan-out.
 */

const MMSI_MIN = 100_000_000;
const MMSI_MAX = 999_999_999;

/**
 * Known MID country prefixes per ITU-R M.585. Generated from the IMO
 * register; the bounds 201-775 cover all assigned country codes.
 * Reserved/auxiliary prefixes (0xx, 111, 970, 972, 974, 99x) are
 * checked separately.
 */
const MID_COUNTRY_MIN = 201;
const MID_COUNTRY_MAX = 775;

const RESERVED_AUXILIARY_PREFIXES = new Set<number>([
  111, // SAR aircraft
  970, // SAR transmitters
  972, // MOB devices
  974, // EPIRB AIS
]);

const RESERVED_AUXILIARY_RANGE_MIN = 990;
const RESERVED_AUXILIARY_RANGE_MAX = 999;

const COAST_STATION_PREFIX = 0; // 00xxxxxxx - coastal station
const GROUP_CALL_PREFIX_MIN = 1;
const GROUP_CALL_PREFIX_MAX = 9; // 0xxxxxxxx - group call (rarely seen)

export function isValidMmsi(mmsi: number): boolean {
  if (!Number.isInteger(mmsi)) return false;
  if (mmsi < MMSI_MIN || mmsi > MMSI_MAX) return false;
  const mid = Math.floor(mmsi / 1_000_000);
  if (mid >= MID_COUNTRY_MIN && mid <= MID_COUNTRY_MAX) return true;
  if (RESERVED_AUXILIARY_PREFIXES.has(mid)) return true;
  if (
    mid >= RESERVED_AUXILIARY_RANGE_MIN &&
    mid <= RESERVED_AUXILIARY_RANGE_MAX
  )
    return true;
  if (mid === COAST_STATION_PREFIX) return true;
  if (mid >= GROUP_CALL_PREFIX_MIN && mid <= GROUP_CALL_PREFIX_MAX) return true;
  return false;
}

export type MmsiRejectionReason =
  | 'mmsi-not-integer'
  | 'mmsi-out-of-range'
  | 'mmsi-unknown-mid';

export function classifyMmsiRejection(mmsi: number): MmsiRejectionReason {
  if (!Number.isInteger(mmsi)) return 'mmsi-not-integer';
  if (mmsi < MMSI_MIN || mmsi > MMSI_MAX) return 'mmsi-out-of-range';
  return 'mmsi-unknown-mid';
}
