import { useCallback, useSyncExternalStore } from 'react';
import { $disabledTrailMmsis } from '@/modules/map/state/trail-visibility';
import { createPerKeyListener } from '../lib/per-key-listener';

/**
 * Per-MMSI subscription to the disabled-trail set. Returns `true` when
 * this vessel's trail is visible (not in the disabled set). Toggling
 * another vessel's flag does not re-render the consumer - the Set
 * reference changes on every mutation, so a plain
 * `useStore($disabledTrailMmsis)` consumer would re-render on any
 * toggle anywhere in the application.
 */
export function useTrailEnabledForMmsi(mmsi: number | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (mmsi === null) return () => {};
      return createPerKeyListener(
        $disabledTrailMmsis,
        !$disabledTrailMmsis.get().has(mmsi),
        snapshot => !snapshot.has(mmsi),
        onChange,
      );
    },
    [mmsi],
  );

  const getSnapshot = useCallback((): boolean => {
    if (mmsi === null) return true;
    return !$disabledTrailMmsis.get().has(mmsi);
  }, [mmsi]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
