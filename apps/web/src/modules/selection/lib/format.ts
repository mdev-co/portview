import { type StaticDimensions, type StaticEta, shipTypeLabel } from '@sps/shared';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const NULL_PLACEHOLDER = '—';

export function formatSog(sog: number | null): string {
  if (sog === null) return '—';
  return `${sog.toFixed(1)} kn`;
}

export function formatCog(cog: number | null): string {
  if (cog === null) return '—';
  return `${cog.toFixed(1)}°`;
}

export function formatHeading(heading: number | null): string {
  if (heading === null) return '—';
  return `${heading}°`;
}

export function formatLatLng(value: number | null, axis: 'lat' | 'lng'): string {
  if (value === null) return '—';
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(6)}° ${hemisphere}`;
}

/** `nowSeconds` is injected so the function stays pure and testable. */
export function formatRelativeTime(timestampUnix: number, nowSeconds: number): string {
  const delta = Math.max(0, Math.floor(nowSeconds - timestampUnix));
  if (delta < SECONDS_PER_MINUTE) return `${delta}s ago`;
  if (delta < SECONDS_PER_HOUR) return `${Math.floor(delta / SECONDS_PER_MINUTE)}m ago`;
  return `${Math.floor(delta / SECONDS_PER_HOUR)}h ago`;
}

export function formatImo(imo: number | null): string {
  return imo === null ? NULL_PLACEHOLDER : String(imo);
}

export function formatCallSign(callSign: string): string {
  return callSign.length === 0 ? NULL_PLACEHOLDER : callSign;
}

export function formatDestination(destination: string): string {
  return destination.length === 0 ? NULL_PLACEHOLDER : destination;
}

export function formatVesselName(vesselName: string): string {
  return vesselName.length === 0 ? NULL_PLACEHOLDER : vesselName;
}

export function formatDraught(draught: number | null): string {
  if (draught === null || draught === 0) return NULL_PLACEHOLDER;
  return `${draught.toFixed(1)} m`;
}

/**
 * AIS ITU-R M.1371-5 §3.3.8.3.5: dimensions are 4 bow/stern/port/starboard
 * offsets from the GPS antenna. Length = bow + stern, width = port + starboard.
 */
export function formatDimensions(dimensions: StaticDimensions | null): string {
  if (dimensions === null) return NULL_PLACEHOLDER;
  const length = dimensions.toBow + dimensions.toStern;
  const width = dimensions.toPort + dimensions.toStarboard;
  if (length === 0 && width === 0) return NULL_PLACEHOLDER;
  return `${length} × ${width} m`;
}

export function formatShipType(code: number): string {
  const label = shipTypeLabel(code);
  return label === null ? NULL_PLACEHOLDER : `${label} (${code})`;
}

const ETA_NOT_AVAILABLE_FIELD = 0;

/**
 * AIS ETA is partial: month/day/hour/minute without year, with 0 marking
 * "not available" in each field. Render as `MM-DD HH:MM` when complete,
 * pieces of it when partial, and the placeholder when fully empty.
 */
export function formatEta(eta: StaticEta): string {
  const month = eta.month;
  const day = eta.day;
  const hour = eta.hour;
  const minute = eta.minute;
  const date =
    month !== null &&
    month !== ETA_NOT_AVAILABLE_FIELD &&
    day !== null &&
    day !== ETA_NOT_AVAILABLE_FIELD
      ? `${pad2(month)}-${pad2(day)}`
      : null;
  const time =
    hour !== null && hour < 24 && minute !== null && minute < 60
      ? `${pad2(hour)}:${pad2(minute)}`
      : null;
  if (date !== null && time !== null) return `${date} ${time}`;
  if (date !== null) return date;
  if (time !== null) return time;
  return NULL_PLACEHOLDER;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
