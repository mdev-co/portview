import type { LiveVessel } from '@/modules/telemetry';
import type { VesselStaticDataFrame } from '@sps/shared';

/**
 * Stable order for the sidebar list. Vessels with a known name sort
 * alphabetically by that name (case-insensitive) ahead of vessels
 * known only by MMSI; ties break on MMSI ascending so two vessels
 * sharing a name never swap positions.
 *
 * The sidebar previously inherited the freshness order from
 * `useVesselList` (timestamp descending), which caused every per-key
 * AIS broadcast to push the touched vessel to the top of its group.
 * The visible side effect was the sidebar dancing whenever the antenna
 * was active.
 */
export function compareVesselsForSidebar(
  a: LiveVessel,
  b: LiveVessel,
  staticData: Readonly<Record<number, VesselStaticDataFrame>>,
): number {
  const nameA = vesselNameOrNull(staticData[a.mmsi]);
  const nameB = vesselNameOrNull(staticData[b.mmsi]);

  if (nameA !== null && nameB !== null) {
    const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.mmsi - b.mmsi;
  }
  if (nameA !== null) return -1;
  if (nameB !== null) return 1;
  return a.mmsi - b.mmsi;
}

function vesselNameOrNull(frame: VesselStaticDataFrame | undefined): string | null {
  if (frame === undefined) return null;
  const trimmed = frame.vesselName.trim();
  return trimmed.length === 0 ? null : trimmed;
}
