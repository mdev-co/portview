import { MapView } from '@/modules/map/components/map-view';
import { VesselSidebar } from '@/modules/selection';

export function IndexRoute() {
  return (
    <div className="bg-background flex h-full">
      <VesselSidebar />
      <div className="relative flex-1">
        <MapView />
      </div>
    </div>
  );
}
