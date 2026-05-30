import { useCallback, useSyncExternalStore } from 'react';
import { $vesselKalmanState } from '@/modules/telemetry';
import type { VesselKalmanState } from '@sps/shared';
import { createPerKeyListener } from '../lib/per-key-listener';

/**
 * Per-MMSI subscription to `$vesselKalmanState`. Matches the convention
 * established by `useVesselStatic` and `useSelectedVessel`: every
 * nano-store consumed inside a React component is read through a
 * dedicated hook in `selection/hooks/`. Filtering at the listen
 * boundary means a row only re-renders when its own kalman state
 * changes, not on every position frame across the fleet.
 */
export function useVesselKalmanForMmsi(mmsi: number | null): VesselKalmanState | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (mmsi === null) return () => {};
      return createPerKeyListener(
        $vesselKalmanState,
        $vesselKalmanState.get()[mmsi] ?? null,
        snapshot => snapshot[mmsi] ?? null,
        onChange,
      );
    },
    [mmsi],
  );

  const getSnapshot = useCallback((): VesselKalmanState | null => {
    if (mmsi === null) return null;
    return $vesselKalmanState.get()[mmsi] ?? null;
  }, [mmsi]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
