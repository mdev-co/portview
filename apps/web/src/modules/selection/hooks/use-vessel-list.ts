import { useMemo } from 'react';
import { $vessels, type LiveVessel } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';

/**
 * Returns the vessel snapshot sorted by `timestampUnix` descending —
 * most recently updated first. Re-renders the consumer on any vessel
 * update; intended for the always-on sidebar list. The detail panel
 * uses a per-MMSI hook (`useSelectedVessel`) instead so it never
 * re-renders for non-selected vessels.
 */
export function useVesselList(): readonly LiveVessel[] {
  const map = useStore($vessels);
  return useMemo(() => {
    const list = Object.values(map);
    list.sort((a, b) => b.timestampUnix - a.timestampUnix);
    return list;
  }, [map]);
}
