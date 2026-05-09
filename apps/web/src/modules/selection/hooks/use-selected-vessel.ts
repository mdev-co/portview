import { useCallback, useSyncExternalStore } from 'react';
import { $vessels, type LiveVessel } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import { $selectedMmsi } from '../store';

/**
 * useSyncExternalStore with a per-MMSI filtered subscribe so vessel
 * updates for non-selected MMSIs do not re-render the consumer. Plain
 * `useStore($vessels)` would re-render on every update across all
 * vessels and was a real perf hit.
 */
export function useSelectedVessel(): LiveVessel | null {
  const selectedMmsi = useStore($selectedMmsi);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (selectedMmsi === null) return () => {};
      let last = $vessels.get()[selectedMmsi] ?? null;
      return $vessels.listen(snapshot => {
        const next = snapshot[selectedMmsi] ?? null;
        if (next !== last) {
          last = next;
          onChange();
        }
      });
    },
    [selectedMmsi],
  );

  const getSnapshot = useCallback((): LiveVessel | null => {
    if (selectedMmsi === null) return null;
    return $vessels.get()[selectedMmsi] ?? null;
  }, [selectedMmsi]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
