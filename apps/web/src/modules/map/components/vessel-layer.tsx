import { useEffect } from 'react';
import { $selectedMmsi, clearSelection, selectVessel } from '@/modules/selection';
import {
  $vesselKalmanState,
  $vesselPositionHistory,
  $vesselStaticData,
  $vessels,
} from '@/modules/telemetry';
import type { MapLayerMouseEvent, MapMouseEvent, Map as MaplibreMap } from 'maplibre-gl';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import { trailsToGeoJSON } from '../lib/trails-to-geojson';
import { ensureVesselIcons } from '../lib/vessel-icons';
import { vesselsToGeoJSON } from '../lib/vessels-to-geojson';
import { $trailVisibilityPredicate } from '../state/trail-visibility';
import {
  VESSEL_ARROW_LAYER_ID,
  VESSEL_LABEL_LAYER_ID,
  VESSEL_LAYER_ID,
  VESSEL_SOURCE_ID,
  VESSEL_TRAIL_SOURCE_ID,
} from '../styles/osm-raster-style';

const VESSEL_INTERACTIVE_LAYERS = [VESSEL_LAYER_ID, VESSEL_ARROW_LAYER_ID, VESSEL_LABEL_LAYER_ID];

const HOVER_CURSOR = 'pointer';

type LayerClickEvent = MapLayerMouseEvent & {
  __vesselHandled?: boolean;
};
type MapClickEvent = MapMouseEvent & {
  __vesselHandled?: boolean;
};

// Selection is encoded as a per-feature property in the rebuilt GeoJSON
// rather than via map.setFeatureState. Feature-state on a source that is
// re-set via setData() at RAF cadence is prone to drop or arrive before
// the matching feature exists, which manifested as occasional invisible
// markers when a vessel was selected from the sidebar list.
export function VesselLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map) {
      ensureVesselIcons(map);
      if (import.meta.env.DEV) {
        (window as unknown as { __sps_map?: MaplibreMap }).__sps_map = map;
      }
    }

    const render = (): void => {
      const vessels = $vessels.get();
      const staticData = $vesselStaticData.get();
      const selectedMmsi = $selectedMmsi.get();
      const kalmanStates = $vesselKalmanState.get();
      const nowSeconds = Math.floor(Date.now() / 1_000);
      controller.setSourceData(
        VESSEL_SOURCE_ID,
        vesselsToGeoJSON(vessels, staticData, selectedMmsi, nowSeconds, kalmanStates),
      );
      // Trails source is rebuilt at the same cadence so live position
      // appends and selection changes show up on the polyline without
      // a separate tick. Visibility predicate combines selection,
      // global show-all toggle and the per-vessel disable set.
      controller.setSourceData(
        VESSEL_TRAIL_SOURCE_ID,
        trailsToGeoJSON(
          $vesselPositionHistory.get(),
          staticData,
          selectedMmsi,
          $trailVisibilityPredicate.get(),
        ),
      );
    };

    render();

    let rafId = 0;
    const tick = (): void => {
      render();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const unsubscribePosition = $vessels.listen(render);
    const unsubscribeStatic = $vesselStaticData.listen(render);
    const unsubscribeSelection = $selectedMmsi.listen(render);
    const unsubscribeHistory = $vesselPositionHistory.listen(render);
    const unsubscribeTrailVisibility = $trailVisibilityPredicate.listen(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      unsubscribePosition();
      unsubscribeStatic();
      unsubscribeSelection();
      unsubscribeHistory();
      unsubscribeTrailVisibility();
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

  return null;
}
