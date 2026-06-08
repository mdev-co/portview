import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { $gridVisible } from '../state/grid-visibility';
import { PRESENTATION_GRID_SOURCE_ID, buildGridForViewport } from '../styles/osm-raster-style';
import { useMapEngine } from './use-map-engine';
import { useMapState } from './use-map-state';

/**
 * Zoom-keyed minor step (deg). Major lines snap to every Nth minor
 * (see MAJOR_EVERY) so a single source feeds both tier layers via
 * filter. Steps follow nice multiples of 1 / 2 / 5 so labels along
 * the lines (if added later) read as clean coordinates.
 */
function gridStepForZoom(zoom: number): number {
  if (zoom < 3) return 10;
  if (zoom < 5) return 5;
  if (zoom < 7) return 1;
  if (zoom < 9) return 0.5;
  if (zoom < 11) return 0.1;
  if (zoom < 13) return 0.05;
  if (zoom < 15) return 0.01;
  return 0.005;
}

const MAJOR_EVERY = 5;
const VIEWPORT_PADDING = 0.2;

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Recompute the coordinate grid for the visible viewport whenever the
 * camera moves or the operator toggles the grid on. Step size is
 * zoom-keyed so the grid stays legible from world view down to berth
 * level — a fixed-step static grid either explodes feature count at
 * low zoom or disappears at high zoom. Off-toggle clears the source
 * so the GPU does not keep buffering an unused FeatureCollection.
 */
export function useDynamicGrid(): void {
  const controller = useMapEngine();
  const { status } = useMapState();
  const gridVisible = useStore($gridVisible);

  useEffect(() => {
    if (status !== 'ready') return;

    if (!gridVisible) {
      controller.setSourceData(PRESENTATION_GRID_SOURCE_ID, EMPTY_FC);
      return;
    }

    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map === null) return;

    const recompute = () => {
      const bounds = map.getBounds();
      const data = buildGridForViewport({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        minorStep: gridStepForZoom(map.getZoom()),
        majorEvery: MAJOR_EVERY,
        padding: VIEWPORT_PADDING,
      });
      controller.setSourceData(PRESENTATION_GRID_SOURCE_ID, data);
    };

    recompute();
    map.on('moveend', recompute);

    return () => {
      map.off('moveend', recompute);
    };
  }, [controller, status, gridVisible]);
}
