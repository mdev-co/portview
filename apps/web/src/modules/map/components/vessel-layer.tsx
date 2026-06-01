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
import { createTransitionTracker } from '../lib/transition-tracker';
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

/**
 * Length of the cubic-ease lerp performed by `smoothedDisplayPosition`
 * after each AIS report. Mirrored here so the rAF tick can prune
 * completed transitions on the same schedule the tracker uses to
 * settle a vessel onto its target coordinate. If the lerp duration
 * changes in `dead-reckoning-tracker.ts`, update this constant in
 * lockstep.
 */
const TRANSITION_DURATION_MS = 1_500;

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

    // Track which MMSIs are inside their 1.5 s lerp window. The rAF
    // tick skips the vessel rebuild entirely when the tracker is
    // empty, which is the steady-state between AIS broadcasts (every
    // 2-180 s per vessel). Each $vessels listener invocation marks
    // the touched mmsi; the tick prunes entries whose transition has
    // elapsed. See ADR-0022 for the full reasoning.
    const transitionTracker = createTransitionTracker(TRANSITION_DURATION_MS);

    const renderVessels = (): void => {
      const nowSeconds = Math.floor(Date.now() / 1_000);
      controller.setSourceData(
        VESSEL_SOURCE_ID,
        vesselsToGeoJSON(
          $vessels.get(),
          $vesselStaticData.get(),
          $selectedMmsi.get(),
          nowSeconds,
          $vesselKalmanState.get(),
        ),
      );
    };

    const renderTrails = (): void => {
      controller.setSourceData(
        VESSEL_TRAIL_SOURCE_ID,
        trailsToGeoJSON(
          $vesselPositionHistory.get(),
          $vesselStaticData.get(),
          $selectedMmsi.get(),
          $trailVisibilityPredicate.get(),
        ),
      );
    };

    // Prime both sources once on mount so the layer is populated
    // before the first AIS report lands. Subsequent updates flow
    // through the rAF tick (vessels) and the dedicated listeners
    // (trails, vessel-property changes).
    renderVessels();
    renderTrails();

    let rafId = 0;
    const tick = (): void => {
      if (transitionTracker.size() > 0) {
        transitionTracker.pruneCompleted(performance.now());
        // Rebuild after the prune so the final tick of a completed
        // transition still writes the settled coordinate. The next
        // idle tick is skipped because the tracker is now empty.
        renderVessels();
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    // Vessel position frames mark the touched mmsi as transitioning so
    // the rAF tick wakes up to animate the lerp. The `_oldValue`
    // parameter is unused but keeps the signature aligned with the
    // nanostores listen contract.
    const unsubscribePosition = $vessels.listen((_value, _oldValue, changedKey) => {
      if (changedKey === undefined) return;
      const mmsi = Number(changedKey);
      if (Number.isFinite(mmsi)) {
        transitionTracker.mark(mmsi, performance.now());
      }
    });

    // Property changes (name, category, selection, trail visibility)
    // do not animate, but they do change feature properties. Mark every
    // currently-displayed mmsi as active for one tick so the next rAF
    // rebuild picks up the new properties. This is coarse - a per-key
    // diff would be cheaper at scale, but the current fleet size makes
    // the simpler approach preferable.
    const markAllVesselsActive = (): void => {
      const nowMs = performance.now();
      for (const mmsiKey in $vessels.get()) {
        const mmsi = Number(mmsiKey);
        if (Number.isFinite(mmsi)) {
          transitionTracker.mark(mmsi, nowMs);
        }
      }
    };

    const unsubscribeStatic = $vesselStaticData.listen(() => {
      markAllVesselsActive();
    });
    const unsubscribeSelection = $selectedMmsi.listen(() => {
      markAllVesselsActive();
      // Selection also paints the trail differently; rebuild now so
      // the polyline highlight matches without waiting for a position
      // history mutation.
      renderTrails();
    });

    // Trails rebuild only when an input that determines the polyline
    // content or styling changes. Position history mutation is the
    // common case (new AIS fix appended). Static data is needed for
    // the per-category trail colour. Selection is handled above so it
    // also marks vessels active. Trail visibility is the show-all
    // toggle plus the per-vessel disable set.
    const unsubscribeHistory = $vesselPositionHistory.listen(() => {
      renderTrails();
    });
    const unsubscribeTrailStaticColour = $vesselStaticData.listen(() => {
      renderTrails();
    });
    const unsubscribeTrailVisibility = $trailVisibilityPredicate.listen(() => {
      renderTrails();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      transitionTracker.clear();
      unsubscribePosition();
      unsubscribeStatic();
      unsubscribeSelection();
      unsubscribeHistory();
      unsubscribeTrailStaticColour();
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
