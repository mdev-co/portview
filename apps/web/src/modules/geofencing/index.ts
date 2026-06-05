/**
 * Public surface of the geofencing module. The state subtree
 * (`atom + map + pipeline + events`) is re-exported through
 * `./state` and the visual surface (zone overlay, sidebar badges,
 * toaster) through `./components`. App-shell wiring imports
 * `useGeofencePipeline` to mount the live pipeline on the index
 * route - the rest of the app should not need to touch internals.
 */

export {
  $geofenceEvents,
  $geofenceMembership,
  $geofencePresence,
  $geofenceZones,
  InvalidZoneIdError,
  RECENT_EVENT_BUFFER_SIZE,
  setGeofenceZones,
} from './state';
export { GeofenceToasterPortal } from './components/geofence-toaster';
export { ZoneBadges } from './components/zone-badges';
export { ZoneDrawToolbar } from './components/zone-draw-toolbar';
export { ZoneLayer } from './components/zone-layer';
export { useGeofencePipeline } from './hooks/use-geofence-pipeline';
