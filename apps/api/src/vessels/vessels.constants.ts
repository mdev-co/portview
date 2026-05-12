/**
 * Stable example values used in OpenAPI @ApiProperty decorators.
 * Centralised so the documentation never drifts between dto.ts and
 * controller.ts, and so each example carries semantic meaning
 * (Szczecin port coordinates, Polish MID, etc.) rather than a
 * random number that future readers do not understand.
 */

// Polish MID is 261; the rest is a vessel-side serial. This MMSI is
// the first one in the local seed and a safe demo value.
export const EXAMPLE_MMSI = 261_000_001;

// IMO numbers are 7-digit hull identifiers issued by the IMO. The
// example below mirrors the seed entry for the same vessel.
export const EXAMPLE_IMO = 9_876_543;

// Wały Chrobrego (Szczecin port quay) lat/lng - anchor of the demo
// map and the spatial centre of the bounding box subscribed at the
// AisStream upstream feed.
export const EXAMPLE_LAT = 53.4267;
export const EXAMPLE_LNG = 14.565;

export const EXAMPLE_SPEED_OVER_GROUND_KN = 5.3;
export const EXAMPLE_COURSE_OVER_GROUND_DEG = 90;
export const EXAMPLE_TRUE_HEADING_DEG = 91;

// Navigation status 5 = "Moored", common for vessels at quay during
// loading/unloading; the most representative status in port traffic.
export const EXAMPLE_NAV_STATUS = 5;

// AIS ship type 70 = "Cargo, all ships of this type". Realistic for
// the Szczecin / Świnoujście container traffic the demo highlights.
export const EXAMPLE_SHIP_TYPE = 70;

export const EXAMPLE_VESSEL_NAME = 'POMERANIA TRADER';
export const EXAMPLE_CALL_SIGN = 'SPPT1';
export const EXAMPLE_DESTINATION = 'GDYNIA';
