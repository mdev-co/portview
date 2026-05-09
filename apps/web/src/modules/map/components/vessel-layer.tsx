import { useEffect } from 'react';
import { $selectedMmsi, clearSelection, selectVessel } from '@/modules/selection';
import { $vessels } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import type { MapLayerMouseEvent, MapMouseEvent, Map as MaplibreMap } from 'maplibre-gl';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import { vesselsToGeoJSON } from '../lib/vessels-to-geojson';
import { VESSEL_LAYER_ID, VESSEL_SOURCE_ID } from '../styles/osm-raster-style';

const HOVER_CURSOR = 'pointer';
const SELECTED_STATE = { selected: true };
const UNSELECTED_STATE = { selected: false };

type LayerClickEvent = MapLayerMouseEvent & {
  __vesselHandled?: boolean;
};
type MapClickEvent = MapMouseEvent & {
  __vesselHandled?: boolean;
};

/**
 * Side-effect component that wires the live vessel store to the
 * pre-declared `vessels` GeoJSON source on the map and brokers
 * selection between the map and the selection store.
 *
 * Three concerns, three effects:
 * 1. Source data sync — `$vessels.listen` -> `setSourceData`. Mutates
 *    the source in place; vessel updates do not re-render React.
 * 2. Click + hover wiring — registered once when the engine is ready.
 *    Click on a circle selects the vessel; click on empty map clears.
 * 3. Selection highlight — flips MapLibre feature-state to drive the
 *    selected paint expression. Applied on selection change only.
 */
export function VesselLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();
  const selectedMmsi = useStore($selectedMmsi);

  useEffect(() => {
    if (status !== 'ready') return;

    controller.setSourceData(VESSEL_SOURCE_ID, vesselsToGeoJSON($vessels.get()));

    const unsubscribe = $vessels.listen(value => {
      controller.setSourceData(VESSEL_SOURCE_ID, vesselsToGeoJSON(value));
    });

    return unsubscribe;
  }, [controller, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (!map) return;

    const onLayerClick = (event: LayerClickEvent): void => {
      const feature = event.features?.[0];
      const mmsi = feature?.id;
      if (typeof mmsi === 'number') {
        selectVessel(mmsi);
        event.__vesselHandled = true;
      }
    };
    const onMapClick = (event: MapClickEvent): void => {
      if (event.__vesselHandled) return;
      clearSelection();
    };
    const onMouseEnter = (): void => {
      map.getCanvas().style.cursor = HOVER_CURSOR;
    };
    const onMouseLeave = (): void => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', VESSEL_LAYER_ID, onLayerClick);
    map.on('click', onMapClick);
    map.on('mouseenter', VESSEL_LAYER_ID, onMouseEnter);
    map.on('mouseleave', VESSEL_LAYER_ID, onMouseLeave);

    return () => {
      map.off('click', VESSEL_LAYER_ID, onLayerClick);
      map.off('click', onMapClick);
      map.off('mouseenter', VESSEL_LAYER_ID, onMouseEnter);
      map.off('mouseleave', VESSEL_LAYER_ID, onMouseLeave);
      map.getCanvas().style.cursor = '';
    };
  }, [controller, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (!map) return;

    if (selectedMmsi !== null) {
      map.setFeatureState({ source: VESSEL_SOURCE_ID, id: selectedMmsi }, SELECTED_STATE);
    }

    return () => {
      if (selectedMmsi !== null) {
        map.setFeatureState({ source: VESSEL_SOURCE_ID, id: selectedMmsi }, UNSELECTED_STATE);
      }
    };
  }, [controller, status, selectedMmsi]);

  return null;
}
