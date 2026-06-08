import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $gridVisible } from '../state/grid-visibility';
import {
  $activeMapStyle,
  ALL_BASE_LAYER_IDS,
  ALL_OVERLAY_LAYER_IDS,
  MAP_STYLE_REGISTRY,
} from '../state/map-style';
import { $seamarkVisible } from '../state/seamark-visibility';
import {
  PRESENTATION_GRID_LAYER_ID,
  PRESENTATION_GRID_MAJOR_LAYER_ID,
  SEAMARK_OVERLAY_LAYER_ID,
} from '../styles/osm-raster-style';
import { useMapEngine } from './use-map-engine';
import { useMapState } from './use-map-state';

/**
 * Sync the active map style descriptor plus the global seamark
 * toggle to the running map's layer visibility. Subscribes to the
 * style atom, the seamark visibility atom, and the map readiness
 * status; on every change walks the base + overlay layer id lists
 * and sets each layer's visibility through the engine adapter.
 *
 * Overlay visibility is the AND of:
 *  - the active style descriptor lists the overlay id, and
 *  - the operator has not toggled the overlay off globally.
 *
 * The hook is the only place layer visibility gets toggled at runtime
 * for the style engine, so the descriptor in MAP_STYLE_REGISTRY plus
 * the per-overlay atoms are the single source of truth for "what is
 * visible right now".
 */
export function useMapStyleSync(): void {
  const activeStyle = useStore($activeMapStyle);
  const seamarkVisible = useStore($seamarkVisible);
  const gridVisible = useStore($gridVisible);
  const { status } = useMapState();
  const controller = useMapEngine();

  useEffect(() => {
    if (status !== 'ready') return;
    const descriptor = MAP_STYLE_REGISTRY[activeStyle];

    for (const baseId of ALL_BASE_LAYER_IDS) {
      controller.setLayerVisibility(baseId, baseId === descriptor.baseLayerId);
    }

    // Set lookup for O(1) per-overlay membership instead of O(N) `includes`
    // on every iteration. Cheap to construct (overlay count is small) and
    // keeps the hook fast even if the registry grows.
    const allowedOverlays = new Set(descriptor.overlayLayerIds);
    for (const overlayId of ALL_OVERLAY_LAYER_IDS) {
      // Per-overlay visibility rule:
      //  - Seamark: descriptor-declared AND global seamark toggle on
      //  - Grid: GLOBAL — visible on any map style when toggle is on,
      //    independent of the descriptor's overlay list
      //  - Anything else: descriptor decides
      let visible: boolean;
      if (overlayId === SEAMARK_OVERLAY_LAYER_ID) {
        visible = allowedOverlays.has(overlayId) && seamarkVisible;
      } else if (
        overlayId === PRESENTATION_GRID_LAYER_ID ||
        overlayId === PRESENTATION_GRID_MAJOR_LAYER_ID
      ) {
        visible = gridVisible;
      } else {
        visible = allowedOverlays.has(overlayId);
      }
      controller.setLayerVisibility(overlayId, visible);
    }
  }, [activeStyle, controller, seamarkVisible, gridVisible, status]);
}
