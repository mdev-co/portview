import { useEffect } from 'react';
import { $selectedMmsi, clearSelection, selectVessel } from '@/modules/selection';
import { $vessels } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import type { MapLayerMouseEvent, MapMouseEvent, Map as MaplibreMap } from 'maplibre-gl';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import { ensureVesselArrowIcon } from '../lib/vessel-arrow-icon';
import { vesselsToGeoJSON } from '../lib/vessels-to-geojson';
import {
  VESSEL_ARROW_LAYER_ID,
  VESSEL_LAYER_ID,
  VESSEL_SOURCE_ID,
} from '../styles/osm-raster-style';

const VESSEL_INTERACTIVE_LAYERS = [VESSEL_LAYER_ID, VESSEL_ARROW_LAYER_ID];

const HOVER_CURSOR = 'pointer';
const SELECTED_STATE = { selected: true };
const UNSELECTED_STATE = { selected: false };

type LayerClickEvent = MapLayerMouseEvent & {
  __vesselHandled?: boolean;
};
type MapClickEvent = MapMouseEvent & {
  __vesselHandled?: boolean;
};

/** Source-data sync, click/hover wiring and selection feature-state are kept in three separate effects below — they have independent lifecycles. */
export function VesselLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();
  const selectedMmsi = useStore($selectedMmsi);

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map) {
      ensureVesselArrowIcon(map);
      if (import.meta.env.DEV) {
        (window as unknown as { __sps_map?: MaplibreMap }).__sps_map = map;
      }
    }

    const render = (): void => {
      controller.setSourceData(VESSEL_SOURCE_ID, vesselsToGeoJSON($vessels.get()));
    };

    render();

    let rafId = 0;
    const tick = (): void => {
      render();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const unsubscribe = $vessels.listen(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      unsubscribe();
    };
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

    for (const layerId of VESSEL_INTERACTIVE_LAYERS) {
      map.on('click', layerId, onLayerClick);
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
    }
    map.on('click', onMapClick);

    return () => {
      for (const layerId of VESSEL_INTERACTIVE_LAYERS) {
        map.off('click', layerId, onLayerClick);
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
      }
      map.off('click', onMapClick);
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
