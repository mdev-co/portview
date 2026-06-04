import { Suspense, lazy } from 'react';
import { MapSkeleton } from '@/modules/map/components/map-skeleton';
import { VesselSidebar } from '@/modules/selection';
import { MapLayout } from '@/shell/map-layout';

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
  return (
    <MapLayout>
      <MapLayout.Sidebar>
        <VesselSidebar />
      </MapLayout.Sidebar>
      <MapLayout.Main>
        <Suspense fallback={<MapSkeleton />}>
          <MapView />
        </Suspense>
      </MapLayout.Main>
    </MapLayout>
  );
}
