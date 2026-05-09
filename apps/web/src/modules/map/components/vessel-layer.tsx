import { useEffect } from 'react';
import { $vessels } from '@/modules/telemetry';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import { vesselsToGeoJSON } from '../lib/vessels-to-geojson';
import { VESSEL_SOURCE_ID } from '../styles/osm-raster-style';

/**
 * Side-effect component that wires the live vessel store to the
 * pre-declared `vessels` GeoJSON source on the map. Subscribes to
 * `$vessels` directly (not via useStore) so vessel updates do not
 * trigger React renders; the source is mutated in place via
 * `MapController.setSourceData`.
 */
export function VesselLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();

  useEffect(() => {
    if (status !== 'ready') return;

    controller.setSourceData(VESSEL_SOURCE_ID, vesselsToGeoJSON($vessels.get()));

    const unsubscribe = $vessels.listen(value => {
      controller.setSourceData(VESSEL_SOURCE_ID, vesselsToGeoJSON(value));
    });

    return unsubscribe;
  }, [controller, status]);

  return null;
}
