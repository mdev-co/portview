import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import type { ExpressionSpecification, Map as MaplibreMap } from 'maplibre-gl';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import {
  VESSEL_ARROW_LAYER_ID,
  VESSEL_LABEL_LAYER_ID,
  VESSEL_LAYER_ID,
  VESSEL_SELECTION_RING_LAYER_ID,
  VESSEL_UNSELECTED_RING_LAYER_ID,
} from '../styles/osm-raster-style';
import { FLAGSHIP_MMSI_SET } from './flagships.config';
import { $threeDMode } from './three-d-toggle.atom';

/**
 * Per-layer opacity paint properties that must drop to zero for
 * flagship MMSIs while 3D is on. Filter-based hiding (`setFilter`)
 * was tried first and rejected: removing the feature from the layer
 * also removes it from MapLibre's hit-test index, so the operator
 * could no longer click a flagship to select it. Opacity-zero leaves
 * the feature in the index - invisible to the eye, present to
 * `queryRenderedFeatures` and the `click` handler. Trail layer is
 * deliberately absent: the polyline must read through the 3D model
 * regardless of mode.
 */
type HideTarget = {
  readonly layerId: string;
  readonly properties: ReadonlyArray<string>;
};

const HIDE_TARGETS: ReadonlyArray<HideTarget> = [
  { layerId: VESSEL_LAYER_ID, properties: ['circle-opacity', 'circle-stroke-opacity'] },
  { layerId: VESSEL_ARROW_LAYER_ID, properties: ['icon-opacity'] },
  { layerId: VESSEL_LABEL_LAYER_ID, properties: ['text-opacity', 'icon-opacity'] },
  { layerId: VESSEL_UNSELECTED_RING_LAYER_ID, properties: ['icon-opacity'] },
  { layerId: VESSEL_SELECTION_RING_LAYER_ID, properties: ['icon-opacity'] },
];

type WrappedKey = `${string}::${string}`;

function wrappedKey(layerId: string, property: string): WrappedKey {
  return `${layerId}::${property}` as WrappedKey;
}

/**
 * Wrap a paint-property baseline so flagship features render at
 * opacity 0. A `["zoom"]` expression can only sit inside a top-level
 * `step` or `interpolate`; wrapping the whole zoom-driven interpolate
 * in `case` triggers `"zoom" expression may only be used as input to
 * a top-level "step"/"interpolate"`. When the baseline is a zoom-keyed
 * interpolate or step we rebuild it with the `case` applied at each
 * STOP output rather than around the outside; for every other shape
 * (constant, data-driven, multiplication of two data-driven inputs)
 * the outer `case` form is allowed and used.
 */
function wrapBaselineWithFlagshipMask(
  baseline: unknown,
  isFlagship: ExpressionSpecification,
): ExpressionSpecification {
  if (Array.isArray(baseline) && baseline.length >= 4) {
    const head = baseline[0];
    if (head === 'interpolate' || head === 'interpolate-hcl' || head === 'interpolate-lab') {
      const input = baseline[2];
      if (Array.isArray(input) && input[0] === 'zoom') {
        const out: unknown[] = [head, baseline[1], input];
        for (let i = 3; i < baseline.length; i += 2) {
          out.push(baseline[i]);
          out.push(['case', isFlagship, 0, baseline[i + 1]]);
        }
        return out as unknown as ExpressionSpecification;
      }
    } else if (head === 'step') {
      const input = baseline[1];
      if (Array.isArray(input) && input[0] === 'zoom') {
        const out: unknown[] = ['step', input, ['case', isFlagship, 0, baseline[2]]];
        for (let i = 3; i < baseline.length; i += 2) {
          out.push(baseline[i]);
          out.push(['case', isFlagship, 0, baseline[i + 1]]);
        }
        return out as unknown as ExpressionSpecification;
      }
    }
  }
  return ['case', isFlagship, 0, baseline ?? 1] as unknown as ExpressionSpecification;
}

/**
 * Hide the 2D markers (icon, label, rings) for every flagship MMSI
 * whenever the 3D toggle is on, while keeping them clickable and
 * leaving the trail polyline untouched. Mounted alongside
 * `<Flagship3DLayer />` so the visual handoff stays inside the same
 * module rather than scattering paint mutations across vessel-layer.
 *
 * Restoration uses `setPaintProperty(layerId, prop, null)` — MapLibre's
 * documented contract for "unset and fall back to the style-spec
 * value". This makes restoration cache-free and immune to "captured
 * the wrapped value" bugs that would otherwise lock a marker
 * permanently invisible once it was hidden. The companion
 * `wrappedRef` records WHICH (layer, property) pairs are currently
 * wrapped so the effect can skip re-wrapping a layer that is already
 * masked (which would otherwise read its own wrapped expression as
 * "the baseline" and nest a second case on top, drifting the meaning
 * each toggle).
 */
export function Flagship2DHider(): null {
  const controller = useMapEngine();
  const { status } = useMapState();
  const threeDOn = useStore($threeDMode);
  const wrappedRef = useRef<Set<WrappedKey>>(new Set());

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map === null) return;

    const flagshipMmsis = Array.from(FLAGSHIP_MMSI_SET).map(Number);
    const isFlagship: ExpressionSpecification = ['in', ['get', 'mmsi'], ['literal', flagshipMmsis]];

    for (const { layerId, properties } of HIDE_TARGETS) {
      if (!map.getLayer(layerId)) continue;
      for (const property of properties) {
        const key = wrappedKey(layerId, property);
        if (threeDOn) {
          if (wrappedRef.current.has(key)) continue;
          const baseline = map.getPaintProperty(layerId, property);
          map.setPaintProperty(
            layerId,
            property,
            wrapBaselineWithFlagshipMask(baseline, isFlagship),
          );
          wrappedRef.current.add(key);
        } else {
          if (!wrappedRef.current.has(key)) continue;
          map.setPaintProperty(layerId, property, null);
          wrappedRef.current.delete(key);
        }
      }
    }
  }, [controller, status, threeDOn]);

  return null;
}
