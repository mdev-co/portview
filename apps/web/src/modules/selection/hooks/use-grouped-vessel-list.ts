import { useMemo } from 'react';
import { VESSEL_STATUS, type VesselStatus } from '@/modules/map/styles/vessel-palette';
import { $vesselStaticData, type LiveVessel } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import { deriveVesselStatus } from '../lib/derive-status';
import { compareVesselsForSidebar } from '../lib/sort-vessels';
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
  // Full-store subscription, deliberately not per-key. The sort order
  // is a function of every vessel's name, so a name landing for any
  // mmsi changes the sidebar order. The atomic per-key pattern
  // (ADR-0021 D-21-5) applies to consumers that read one vessel's
  // value; here the whole map is the input. Throttling kicks in
  // through the upstream useVesselList already.
  const staticData = useStore($vesselStaticData);
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
    for (const status of GROUP_ORDER) {
      buckets[status].sort((a, b) => compareVesselsForSidebar(a, b, staticData));
    }
    return GROUP_ORDER.flatMap(status => {
      const items = buckets[status];
      return items.length === 0 ? [] : [{ status, items }];
    });
  }, [list, staticData]);
}
