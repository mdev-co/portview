import { Suspense, lazy } from 'react';
import { GeofenceToaster, useGeofencePipeline } from '@/modules/geofencing';
import { MapSkeleton } from '@/modules/map/components/map-skeleton';

/**
 * MapView pulls in MapLibre and the entire map module (~180 KB gzip).
 * It is loaded lazily so the initial bundle stays focused on the App
 * Shell + sidebar which are what the operator sees first. The
 * Suspense fallback (MapSkeleton) holds the layout slot at the same
 * size during the chunk fetch so CLS is zero.
 */
const MapView = lazy(() =>
  import('@/modules/map/components/map-view').then(module => ({ default: module.MapView })),
);

export function IndexRoute() {
  // The geofence pipeline subscribes to `$vessels` and runs the
  // dwell-time machine on every frame. It is mounted at the route
  // level (not the App Shell) so the listener tears down cleanly
  // when the user navigates away and re-mounts when they come back.
  // Idempotent under React Strict Mode double-mount in dev.
  useGeofencePipeline();

  return (
    <>
      <Suspense fallback={<MapSkeleton />}>
        <MapView />
      </Suspense>
      {/* Sonner Toaster portal mounts at route boundary so it paints
          above the shell. Owns the $geofenceEvents subscription. */}
      <GeofenceToaster />
    </>
  );
}
