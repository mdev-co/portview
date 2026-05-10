import { useCallback, useSyncExternalStore } from 'react';
import { $vesselStaticData } from '@/modules/telemetry';
import type { VesselStaticDataFrame } from '@sps/shared';

/**
 * Per-MMSI subscription to `$vesselStaticData`. Mirrors the pattern used
 * for the live position store: a filtered listen so static updates for
 * other vessels do not re-render the consumer.
 */
export function useVesselStatic(mmsi: number | null): VesselStaticDataFrame | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (mmsi === null) return () => {};
      let last = $vesselStaticData.get()[mmsi] ?? null;
      return $vesselStaticData.listen(snapshot => {
        const next = snapshot[mmsi] ?? null;
        if (next !== last) {
          last = next;
          onChange();
        }
      });
    },
    [mmsi],
  );

  const getSnapshot = useCallback((): VesselStaticDataFrame | null => {
    if (mmsi === null) return null;
    return $vesselStaticData.get()[mmsi] ?? null;
  }, [mmsi]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
