import { useEffect, useRef } from 'react';
import { MapController } from '@/modules/map/core/map-controller';
import { $vesselStaticData } from '@/modules/telemetry/vessel-static.store';
import { $vessels } from '@/modules/telemetry/vessels.store';
import { Toaster, toast } from 'sonner';
import type { GeofenceEvent, ZoneId } from '@sps/shared';
import { $geofenceEvents } from '../state/geofence-events.store';
import { $geofenceZones } from '../state/geofence-zones.atom';

const ZOOM_TO_VESSEL_LEVEL = 14;
const EXIT_TOAST_DURATION_MS = 6_000;

/**
 * Sonner Toaster + a subscription that fires a toast for every new
 * geofence event the pipeline appends to `$geofenceEvents`. Mounted
 * once at the App Shell level. The Toaster itself is the sonner
 * UI portal; this component just owns the subscription.
 *
 * UX rules:
 * - Enter and ghost-exit toasts are persistent (operator-critical -
 *   they should not auto-dismiss while the operator is reading the
 *   map). Exit toasts auto-dismiss because they are informational.
 * - Each toast carries a Zoom action that flies the map to the
 *   vessel's last known position - one click jumps the operator
 *   from "what happened?" to "where is it?".
 * - Click on the toast body does not dismiss; only the close button
 *   (X) clears the toast.
 *
 * Implementation detail: `$geofenceEvents` is a bounded ring buffer
 * (last 100 events) appended in batches. We track the last-seen
 * length in a ref and slice off any items past that index on each
 * subscription tick - that way batched appends still surface every
 * event without firing for entries already shown. The ring buffer's
 * shift-from-front on overflow can drop our reference; the
 * `Math.max(0, ...)` clamp keeps the slice stable even if items
 * rolled off between ticks.
 */
export function GeofenceToaster(): React.JSX.Element {
  const lastIndexRef = useRef(0);

  useEffect(() => {
    lastIndexRef.current = $geofenceEvents.get().length;

    const unsubscribe = $geofenceEvents.subscribe(events => {
      if (events.length === 0) {
        lastIndexRef.current = 0;
        return;
      }
      const startIdx = Math.max(0, lastIndexRef.current);
      const fresh = events.slice(startIdx);
      lastIndexRef.current = events.length;
      for (const event of fresh) {
        fireToast(event);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      visibleToasts={5}
      // Operator-paced UI - sonner default expand-on-hover obscures
      // map content under the toast stack; collapse keeps the badge
      // density bounded.
      expand={false}
    />
  );
}

function fireToast(event: GeofenceEvent): void {
  const zoneLabel = labelForZone(event.zoneId);
  const vesselLabel = labelForVessel(event.mmsi);
  const id = toastIdFor(event);
  const action = {
    label: 'Zoom',
    onClick: () => zoomToVessel(event.mmsi),
  };

  if (event.kind === 'enter') {
    toast.info(`${vesselLabel} entered ${zoneLabel}`, {
      id,
      duration: Infinity,
      action,
    });
    return;
  }
  if (event.kind === 'exit') {
    toast(`${vesselLabel} left ${zoneLabel}`, {
      id,
      duration: EXIT_TOAST_DURATION_MS,
      action,
    });
    return;
  }
  // ghost-exit: vessel disappeared while still confirmed inside.
  const silentMin = Math.round(event.silentForMs / 60_000);
  toast.warning(`${vesselLabel} silent in ${zoneLabel} for ${silentMin} min`, {
    id,
    duration: Infinity,
    action,
  });
}

function zoomToVessel(mmsi: number): void {
  const vessel = $vessels.get()[mmsi];
  if (vessel === undefined) return;
  if (vessel.lng === null || vessel.lat === null) return;
  MapController.getInstance().flyTo([vessel.lng, vessel.lat], ZOOM_TO_VESSEL_LEVEL);
}

function toastIdFor(event: GeofenceEvent): string {
  return `${event.kind}|${event.mmsi}|${event.zoneId}|${event.at}`;
}

function labelForZone(id: ZoneId): string {
  const zones = $geofenceZones.get().features;
  const match = zones.find(z => z.properties.id === id);
  return match?.properties.label ?? String(id);
}

function labelForVessel(mmsi: number): string {
  const staticData = $vesselStaticData.get();
  const entry = staticData[mmsi];
  const name = entry?.vesselName?.trim();
  if (name !== undefined && name.length > 0) return name;
  return `MMSI ${mmsi}`;
}
