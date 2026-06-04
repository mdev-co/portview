import { atom } from 'nanostores';
import type { GeofenceEvent } from '@sps/shared';

/**
 * Bounded ring buffer of the most recent geofence events. The
 * "Recent" sidebar tab renders this list; toasts read it too via
 * a "last event" subscription pattern. Older events drop off the
 * tail when the buffer fills, so memory stays constant regardless
 * of session length.
 */
export const RECENT_EVENT_BUFFER_SIZE = 100;

export const $geofenceEvents = atom<readonly GeofenceEvent[]>([]);

/**
 * Append a batch of events to the recent buffer, dropping older
 * entries past `RECENT_EVENT_BUFFER_SIZE`. Batch parameter shape
 * matches the dwell-machine's TickResult.events so producers can
 * forward it without copying.
 */
export function appendGeofenceEvents(batch: readonly GeofenceEvent[]): void {
  if (batch.length === 0) return;
  const prev = $geofenceEvents.get();
  const merged = [...prev, ...batch];
  const trimmed =
    merged.length > RECENT_EVENT_BUFFER_SIZE
      ? merged.slice(merged.length - RECENT_EVENT_BUFFER_SIZE)
      : merged;
  $geofenceEvents.set(trimmed);
}

/** Reset the buffer; only used on app shell teardown / tests. */
export function clearGeofenceEvents(): void {
  $geofenceEvents.set([]);
}
