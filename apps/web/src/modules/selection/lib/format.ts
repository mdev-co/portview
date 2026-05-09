/**
 * Pure formatters for the vessel details panel. Kept module-scope and
 * pre-built so the panel render path does no allocation per frame.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;

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

/**
 * Compact relative time. Inputs are seconds since epoch (matches the
 * VesselUpdateFrame timestampUnix field). Caller passes `nowSeconds`
 * so the function stays pure and testable.
 */
export function formatRelativeTime(timestampUnix: number, nowSeconds: number): string {
  const delta = Math.max(0, Math.floor(nowSeconds - timestampUnix));
  if (delta < SECONDS_PER_MINUTE) return `${delta}s ago`;
  if (delta < SECONDS_PER_HOUR) return `${Math.floor(delta / SECONDS_PER_MINUTE)}m ago`;
  return `${Math.floor(delta / SECONDS_PER_HOUR)}h ago`;
}
