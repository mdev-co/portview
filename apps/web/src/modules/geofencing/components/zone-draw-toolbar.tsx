import { useEffect, useRef, useState } from 'react';
import { useMapEngine } from '@/modules/map/hooks/use-map-engine';
import { useMapState } from '@/modules/map/hooks/use-map-state';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { type Zone, type ZoneCollection, zoneId } from '@sps/shared';
import { setGeofenceZones } from '../state/geofence-zones.atom';
import { $geofenceZones } from '../state/geofence-zones.atom';

/**
 * Operator drawing toolbar - a single header button that toggles
 * polygon drawing on the live map. `terra-draw` and its MapLibre
 * adapter are dynamically imported on first click so the ~40 KB
 * library does not weigh down the initial bundle (most operators
 * never enter drawing mode). The dynamic import is cached by the
 * browser after the first load.
 *
 * Lifecycle:
 *   1. Operator clicks "Draw Zone" -> dynamic import resolves ->
 *      terra-draw instance bound to the running MapLibre map ->
 *      polygon mode active.
 *   2. Operator clicks vertices on the map; double-click closes
 *      the polygon. terra-draw emits a `finish` event.
 *   3. Handler converts the GeoJSON polygon to a `Zone` feature
 *      with an auto-generated id + label, appends to the existing
 *      `$geofenceZones` FeatureCollection, and exits drawing mode.
 *   4. Operator can click the toolbar button again to cancel
 *      without saving.
 *
 * Why a stateful single button instead of a tool palette: the MVP
 * has exactly one shape (polygon) and one operator action (save).
 * The UI tax of a multi-tool ribbon is not justified at this scope;
 * when a second shape (rectangle, circle) lands, the button widens
 * to a dropdown without changing the atom contract.
 */
export function ZoneDrawToolbar(): React.JSX.Element {
  const controller = useMapEngine();
  const { status } = useMapState();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const drawRef = useRef<{ stop: () => void } | null>(null);

  // If the map engine resets (style swap, dispose), make sure we
  // stop the active draw session so we do not leak listeners onto
  // a torn-down map instance.
  useEffect(() => {
    if (status === 'ready') return;
    if (drawRef.current !== null) {
      drawRef.current.stop();
      drawRef.current = null;
      setActive(false);
    }
  }, [status]);

  async function startDrawing(): Promise<void> {
    if (status !== 'ready' || active || loading) return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map === null) return;
    setLoading(true);
    try {
      // Lazy import: keeps terra-draw out of the initial bundle.
      const [{ TerraDraw, TerraDrawPolygonMode }, { TerraDrawMapLibreGLAdapter }] =
        await Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')]);

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawPolygonMode()],
      });
      draw.start();
      draw.setMode('polygon');

      // terra-draw emits `finish` with the id of the completed
      // feature. We pull the GeoJSON from the snapshot, fold it
      // into the zones atom, and tear the session down so the
      // operator returns to the normal map interaction state.
      draw.on('finish', (id: string | number) => {
        const snapshot = draw.getSnapshot();
        const feature = snapshot.find(f => f.id === id);
        draw.stop();
        drawRef.current = null;
        setActive(false);
        if (feature === undefined) return;
        if (feature.geometry.type !== 'Polygon') return;
        appendZone(feature.geometry.coordinates as number[][][]);
      });

      drawRef.current = { stop: (): void => draw.stop() };
      setActive(true);
    } finally {
      setLoading(false);
    }
  }

  function cancelDrawing(): void {
    if (drawRef.current === null) return;
    drawRef.current.stop();
    drawRef.current = null;
    setActive(false);
  }

  const disabled = status !== 'ready';
  const label = loading ? 'Loading...' : active ? 'Cancel' : 'Draw Zone';
  const variant = active
    ? 'border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300'
    : 'border-border bg-background text-foreground hover:bg-accent';

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={active ? cancelDrawing : startDrawing}
      className={`rounded border px-2 py-1 text-xs font-medium tracking-wide uppercase transition disabled:opacity-50 ${variant}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/**
 * Convert a freshly-drawn polygon's coordinates to a `Zone`
 * feature and merge it into the active collection. The new zone
 * gets a deterministic-ish id (`custom-<timestamp>`) and a generic
 * label (`Custom Zone N`) - operator renaming is a follow-up task
 * once we have a zone-properties editor.
 */
function appendZone(coordinates: number[][][]): void {
  const current = $geofenceZones.get();
  const nextIndex = customZoneIndex(current) + 1;
  const newZone: Zone = {
    type: 'Feature',
    properties: {
      id: zoneId(`custom-${Date.now()}`),
      label: `Custom Zone ${nextIndex}`,
      kind: 'general',
      description: 'Drawn by operator',
    },
    geometry: {
      type: 'Polygon',
      coordinates: coordinates.map(ring =>
        ring.map(point => {
          const lng = point[0];
          const lat = point[1];
          if (lng === undefined || lat === undefined) {
            throw new Error('terra-draw polygon ring contains a malformed [lng, lat] tuple');
          }
          return [lng, lat];
        }),
      ),
    },
  };
  const next: ZoneCollection = {
    type: 'FeatureCollection',
    features: [...current.features, newZone],
  };
  setGeofenceZones(next);
}

function customZoneIndex(collection: ZoneCollection): number {
  let max = 0;
  for (const feature of collection.features) {
    const label = feature.properties.label;
    const match = /^Custom Zone (\d+)$/u.exec(label);
    if (match === null || match[1] === undefined) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
