import type { LiveVessel } from '@/modules/telemetry';
import { useThrottledSortedVesselList } from './use-throttled-vessel-list';

/**
 * Sidebar-facing vessel list. Routes through the throttled subscription
 * so the list does not reconcile on every ingest frame - position
 * updates land in the store at 10-20 Hz, React commits at 4 Hz. The
 * sort order (freshest first) and the returned shape are unchanged for
 * callers.
 */
export function useVesselList(): readonly LiveVessel[] {
  return useThrottledSortedVesselList();
}
