import { useEffect, useRef } from 'react';
import { MapController } from '@/modules/map/core/map-controller';
import { $vesselStaticData } from '@/modules/telemetry/vessel-static.store';
import { $vessels } from '@/modules/telemetry/vessels.store';
import { Toaster, toast } from 'sonner';
import { type GeofenceEvent, type ZoneId, isInsideZone } from '@sps/shared';
import { $geofenceEvents } from '../state/geofence-events.store';
import { $geofenceZones } from '../state/geofence-zones.atom';

const ZOOM_TO_VESSEL_LEVEL = 15;
const EXIT_TOAST_DURATION_MS = 6_000;
const SUMMARY_TOAST_DELAY_MS = 4_000;
const SUMMARY_TOAST_DURATION_MS = 8_000;

/**
 * Wall-clock window after the toaster mounts during which Enter
 * toasts are silenced. Vessels parked inside a zone at boot trip a
 * confirmed Enter exactly one dwell window (30 s) after the first
 * AIS frame; UX-wise those reads as "the app yelling at me about
 * ships I can already see on the map", not as live alerts. The
 * pipeline still appends every transition to `$geofenceEvents`, so
 * the Events sidebar shows the same confirmations as a history -
 * only the synchronous toast popup is gated. >=3x dwell so a vessel
 * that briefly straddles the boundary during warmup still settles
 * silently before live alerts kick in.
 */
const TOASTER_ENTER_WARMUP_MS = 90_000;

/**
 * Module-level guards so React StrictMode's dev double-effect does
 * not fire the welcome and summary toasts twice. Module scope
 * persists across mounts in the same page load.
 */
let welcomeFiredThisPage = false;
let summaryFiredThisPage = false;

/**
 * Sonner Toaster portal + every subscription that fires a toast.
 * Mounted ONCE at the App Shell level (App.tsx) so it lives above
 * the route's Suspense boundary - lazy-loading the map module does
 * not unmount the toaster, and the subscriptions to vessels/events
 * stay alive without the Suspense fallback cycling them.
 *
 * Why this matters: an earlier version mounted the Toaster inside
 * IndexRoute, which re-rendered whenever the lazy MapView chunk
 * resolved. The remount cycle wiped sonner's local toast state at
 * the exact moment a summary toast was being added, so the toast
 * was accepted by the store but never reached the visible portal.
 * Moving everything one level up to App.tsx fixes it.
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
 * - On first paint, once vessels have arrived, a one-shot summary
 *   toast shows tracked/in-zone counts so the operator sees the
 *   system is alive without scrubbing the map.
 */
export function GeofenceToasterPortal(): React.JSX.Element {
  const lastIndexRef = useRef(0);
  const mountedAtRef = useRef<number>(0);

  useEffect(() => {
    mountedAtRef.current = Date.now();
    // Sonner 2.x lazy-mounts its visual <ol> portal only when the
    // first toast is added. Without this primer toast, a later
    // toast triggered from a setTimeout callback lands in sonner
    // state but the Toaster does not re-render the portal - the
    // toast never appears. The welcome toast primes sonner so every
    // subsequent toast renders AND tells the operator the surface
    // is live. Deferred to a microtask so the Toaster's React
    // render commits BEFORE the toast is added to sonner state -
    // otherwise the state update arrives before the Toaster has
    // subscribed and the toast is dropped on the floor. The
    // module-level flag is the StrictMode dev double-effect guard:
    // the second pass sees the flag set and skips.
    queueMicrotask(() => {
      if (welcomeFiredThisPage) return;
      welcomeFiredThisPage = true;
      toast('Smart Port online', {
        duration: 1_500,
        description: 'Live operator surface armed.',
      });
    });

    lastIndexRef.current = $geofenceEvents.get().length;

    const unsubscribeEvents = $geofenceEvents.subscribe(events => {
      if (events.length === 0) {
        lastIndexRef.current = 0;
        return;
      }
      const startIdx = Math.max(0, lastIndexRef.current);
      const fresh = events.slice(startIdx);
      lastIndexRef.current = events.length;
      const inWarmup = Date.now() - mountedAtRef.current < TOASTER_ENTER_WARMUP_MS;
      for (const event of fresh) {
        // Boot-time confirmations (Enter events fired while the
        // user has only just opened the app) are noise, not alerts.
        // Exit and ghost-exit always surface - those are state
        // changes the operator did not see coming.
        if (inWarmup && event.kind === 'enter') continue;
        fireToast(event);
      }
    });

    let settleHandle: number | null = null;
    const unsubscribeVessels = $vessels.subscribe(snapshot => {
      if (summaryFiredThisPage) return;
      if (Object.keys(snapshot).length === 0) return;
      if (settleHandle !== null) return;
      settleHandle = window.setTimeout(() => {
        settleHandle = null;
        if (summaryFiredThisPage) return;
        const vessels = $vessels.get();
        const vesselCount = Object.keys(vessels).length;
        if (vesselCount === 0) return;
        // Compute in-zone count directly via point-in-polygon rather
        // than reading $geofencePresence: dwell-time membership needs
        // 30 s of stable presence to confirm, so at the 4 s summary
        // mark presence is still empty even when there ARE vessels
        // visibly inside zones. The summary is a stats snapshot, not
        // an event - dwell hysteresis is the wrong gate here.
        const zones = $geofenceZones.get().features;
        let inZone = 0;
        for (const key in vessels) {
          const vessel = vessels[key];
          if (vessel === undefined) continue;
          if (vessel.lng === null || vessel.lat === null) continue;
          for (const zone of zones) {
            if (zone.properties.visible === false) continue;
            if (isInsideZone(vessel.lng, vessel.lat, zone)) {
              inZone += 1;
              break;
            }
          }
        }
        summaryFiredThisPage = true;
        toast.info(`Tracking ${vesselCount} vessels - ${inZone} currently inside a zone.`, {
          id: 'geofence-summary',
          duration: SUMMARY_TOAST_DURATION_MS,
          description: 'Live AIS feed via EdgeBridge. Click Zones in the dock to manage areas.',
        });
        // Summary is a one-shot toast for the whole session. The
        // $vessels subscription only existed to wait for the first
        // non-empty snapshot; once the toast has fired the listener
        // would keep firing on every AIS frame for the rest of the
        // session, paying nanostores notification cost just to short-
        // circuit on `summaryFiredThisPage`. Self-unsubscribe so the
        // subscription dies with its purpose.
        unsubscribeVessels();
      }, SUMMARY_TOAST_DELAY_MS);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeVessels();
      if (settleHandle !== null) window.clearTimeout(settleHandle);
    };
  }, []);

  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      closeButton
      visibleToasts={5}
      expand={false}
      offset="80px"
      // No swipe-to-dismiss; the swipe gesture artefact (stretched
      // ghost cards under the active toast on press) is visually
      // confusing in the operator context. Operator dismisses via
      // the close button.
      swipeDirections={[]}
      // Sonner exposes its colour palette through CSS variables on
      // the Toaster root. Re-mapping them to our oklch design
      // tokens keeps toasts on-theme without overriding sonner CSS
      // with !important from outside.
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-bg-hover': 'var(--accent)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--normal-border-hover': 'var(--border)',
        } as React.CSSProperties
      }
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
  const description = vesselContext(event.mmsi);

  if (event.kind === 'enter') {
    toast.info(`${vesselLabel} entered ${zoneLabel}`, {
      id,
      duration: Infinity,
      description,
      action,
    });
    return;
  }
  if (event.kind === 'exit') {
    toast(`${vesselLabel} left ${zoneLabel}`, {
      id,
      duration: EXIT_TOAST_DURATION_MS,
      description,
      action,
    });
    return;
  }
  // ghost-exit: vessel disappeared while still confirmed inside.
  const silentMin = Math.round(event.silentForMs / 60_000);
  toast.warning(`${vesselLabel} silent in ${zoneLabel} for ${silentMin} min`, {
    id,
    duration: Infinity,
    description,
    action,
  });
}

/**
 * Compose a "speed / heading / call sign" descriptor for the toast
 * body so the operator gets vessel context without opening the
 * sidebar. Returns undefined when no usable telemetry is available,
 * so the description row collapses cleanly.
 */
function vesselContext(mmsi: number): string | undefined {
  const vessel = $vessels.get()[mmsi];
  if (vessel === undefined) return undefined;
  const parts: string[] = [];
  if (vessel.sog !== null && Number.isFinite(vessel.sog)) {
    parts.push(`${vessel.sog.toFixed(1)} kn`);
  }
  if (vessel.cog !== null && Number.isFinite(vessel.cog)) {
    parts.push(`${Math.round(vessel.cog)}\u00b0`);
  }
  const staticEntry = $vesselStaticData.get()[mmsi];
  if (staticEntry?.callSign !== undefined && staticEntry.callSign.trim().length > 0) {
    parts.push(staticEntry.callSign.trim());
  }
  return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
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
