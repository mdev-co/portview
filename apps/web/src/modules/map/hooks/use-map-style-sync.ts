import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  $activeMapStyle,
  ALL_BASE_LAYER_IDS,
  ALL_OVERLAY_LAYER_IDS,
  MAP_STYLE_REGISTRY,
} from '../state/map-style';
import { $seamarkVisible } from '../state/seamark-visibility';
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
  const { status } = useMapState();
  const controller = useMapEngine();

  useEffect(() => {
    if (status !== 'ready') return;
    const descriptor = MAP_STYLE_REGISTRY[activeStyle];

    for (const baseId of ALL_BASE_LAYER_IDS) {
      controller.setLayerVisibility(baseId, baseId === descriptor.baseLayerId);
    }

    for (const overlayId of ALL_OVERLAY_LAYER_IDS) {
      const descriptorAllows = descriptor.overlayLayerIds.includes(overlayId);
      const togglesAllow = overlayId === 'overlay-seamark' ? seamarkVisible : true;
      controller.setLayerVisibility(overlayId, descriptorAllows && togglesAllow);
    }
  }, [activeStyle, controller, seamarkVisible, status]);
}
