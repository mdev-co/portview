import { useCallback, useSyncExternalStore } from 'react';
import { $vessels, type LiveVessel } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import { $selectedMmsi } from '../store';

/**
 * Returns the LiveVessel for the currently selected MMSI, or null when
 * nothing is selected. Re-renders the consumer only on selection
 * changes or on the selected vessel's data change. Other vessels
 * update without involving the consumer.
 *
 * Implementation: useSyncExternalStore with a per-MMSI filtered
 * subscribe. The subscribe callback ignores updates whose value for
 * the selected MMSI is identity-equal to the last snapshot, so React
 * re-render fires only when the selected vessel actually changes.
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
