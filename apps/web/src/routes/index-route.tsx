import { MapView } from '@/modules/map/components/map-view';
import { VesselSidebar } from '@/modules/selection';
import { MapLayout } from '@/shell/map-layout';

export function IndexRoute() {
  return (
    <MapLayout>
      <MapLayout.Sidebar>
        <VesselSidebar />
      </MapLayout.Sidebar>
      <MapLayout.Main>
        <MapView />
      </MapLayout.Main>
    </MapLayout>
  );
}
