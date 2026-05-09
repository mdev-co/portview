import { useMemo } from 'react';
import { $vessels, type LiveVessel } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';

export function useVesselList(): readonly LiveVessel[] {
  const map = useStore($vessels);
  return useMemo(() => {
    const list = Object.values(map);
    list.sort((a, b) => b.timestampUnix - a.timestampUnix);
    return list;
  }, [map]);
}
