import { useMemo } from 'react';
import { VESSEL_STATUS, type VesselStatus } from '@/modules/map/styles/vessel-palette';
import type { LiveVessel } from '@/modules/telemetry';
import { deriveVesselStatus } from '../lib/derive-status';
import { useVesselList } from './use-vessel-list';

export type VesselGroup = {
  readonly status: VesselStatus;
  readonly items: readonly LiveVessel[];
};

const GROUP_ORDER: readonly VesselStatus[] = [
  VESSEL_STATUS.underway,
  VESSEL_STATUS.nuc,
  VESSEL_STATUS.anchored,
  VESSEL_STATUS.stopped,
];

export function useGroupedVesselList(): readonly VesselGroup[] {
  const list = useVesselList();
  return useMemo(() => {
    const buckets: Record<VesselStatus, LiveVessel[]> = {
      underway: [],
      anchored: [],
      stopped: [],
      nuc: [],
    };
    for (const vessel of list) {
      buckets[deriveVesselStatus(vessel)].push(vessel);
    }
    return GROUP_ORDER.flatMap(status => {
      const items = buckets[status];
      return items.length === 0 ? [] : [{ status, items }];
    });
  }, [list]);
}
