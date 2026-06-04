import { useEffect } from 'react';
import { useMapEngine } from '@/modules/map/hooks/use-map-engine';
import { useMapState } from '@/modules/map/hooks/use-map-state';
import type { ExpressionSpecification, GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import type { ZoneCollection } from '@sps/shared';
import { $geofenceZones } from '../state/geofence-zones.atom';

function filterVisible(collection: ZoneCollection): ZoneCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.filter(f => f.properties.visible !== false),
  };
}

/**
 * MapLibre source + layer identifiers owned by the zone overlay.
 * Kept module-scope so the cleanup path in the effect can remove the
 * exact same artifacts it added without keeping a closure-captured
 * mutable list.
 */
const ZONE_SOURCE_ID = 'geofence-zones';
const ZONE_FILL_LAYER_ID = 'geofence-zones-fill';
const ZONE_OUTLINE_LAYER_ID = 'geofence-zones-outline';
const ZONE_LABEL_LAYER_ID = 'geofence-zones-label';

/**
 * Paint expression that picks a fill color from `properties.kind`.
 * MapLibre style expressions accept a `["match", input, ...cases]`
 * form which evaluates per feature inside the GPU pipeline - cheaper
 * than rebuilding the FeatureCollection with per-feature paint
 * properties and cheaper than maintaining one layer per kind.
 *
 * Colors picked from the project's Tailwind v4 token set so they
 * read consistently against both light (OSM Mapnik) and dark
 * (Carto Dark / Tactical / Backdrop) basemaps. Alpha is set on the
 * fill-opacity property below.
 */
const FILL_COLOR_BY_KIND: ExpressionSpecification = [
  'match',
  ['get', 'kind'],
  'anchorage',
  '#fbbf24', // amber-400
  'channel',
  '#3b82f6', // blue-500
  'restricted',
  '#ef4444', // red-500
  'harbor',
  '#10b981', // emerald-500
  '#94a3b8', // slate-400 - 'general' / fallback
];

const OUTLINE_COLOR_BY_KIND: ExpressionSpecification = [
  'match',
  ['get', 'kind'],
  'anchorage',
  '#92400e', // amber-800
  'channel',
  '#1e3a8a', // blue-900
  'restricted',
  '#7f1d1d', // red-900
  'harbor',
  '#064e3b', // emerald-900
  '#475569', // slate-600 - fallback
];

/**
 * Mount the geofence zones overlay onto the running MapLibre engine.
 *
 * Lifecycle: when the map controller reports `ready`, we attach a
 * GeoJSON source seeded from `$geofenceZones`, then layer fill +
 * outline + label on top. A subscription to `$geofenceZones` calls
 * `setSourceData` whenever the operator (or terra-draw save in
 * Session 2's toolbar) replaces the FeatureCollection. The cleanup
 * path removes all four artifacts in reverse order so a map engine
 * swap (style switch) does not leak.
 *
 * Why these three layers (not one): MapLibre paints layers in
 * declaration order. Fill must paint first (so the outline reads on
 * top of it), outline second, label last (so the label is never
 * occluded by another zone's fill). One layer with both fill and
 * stroke would force every feature into the same paint pass and
 * cannot achieve the same depth ordering.
 */
export function ZoneLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();

  useEffect(() => {
    if (status !== 'ready') return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map === null) return;

    const initial = filterVisible($geofenceZones.get());
    if (!map.getSource(ZONE_SOURCE_ID)) {
      map.addSource(ZONE_SOURCE_ID, { type: 'geojson', data: initial });
    } else {
      // Source already exists from a previous mount cycle - just refresh.
      (map.getSource(ZONE_SOURCE_ID) as GeoJSONSource).setData(initial);
    }

    if (!map.getLayer(ZONE_FILL_LAYER_ID)) {
      map.addLayer({
        id: ZONE_FILL_LAYER_ID,
        type: 'fill',
        source: ZONE_SOURCE_ID,
        paint: {
          'fill-color': FILL_COLOR_BY_KIND,
          'fill-opacity': 0.18,
        },
      });
    }
    if (!map.getLayer(ZONE_OUTLINE_LAYER_ID)) {
      map.addLayer({
        id: ZONE_OUTLINE_LAYER_ID,
        type: 'line',
        source: ZONE_SOURCE_ID,
        paint: {
          'line-color': OUTLINE_COLOR_BY_KIND,
          'line-width': 1.5,
          'line-opacity': 0.85,
        },
      });
    }
    if (!map.getLayer(ZONE_LABEL_LAYER_ID)) {
      map.addLayer({
        id: ZONE_LABEL_LAYER_ID,
        type: 'symbol',
        source: ZONE_SOURCE_ID,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-letter-spacing': 0.08,
          'text-transform': 'uppercase',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': OUTLINE_COLOR_BY_KIND,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });
    }

    const unsubscribe = $geofenceZones.subscribe(next => {
      const source = map.getSource(ZONE_SOURCE_ID) as GeoJSONSource | undefined;
      if (source) source.setData(filterVisible(next));
    });

    return (): void => {
      unsubscribe();
      // Remove layers in REVERSE declaration order so MapLibre never
      // has a paint pass referencing a layer that no longer exists.
      if (map.getLayer(ZONE_LABEL_LAYER_ID)) map.removeLayer(ZONE_LABEL_LAYER_ID);
      if (map.getLayer(ZONE_OUTLINE_LAYER_ID)) map.removeLayer(ZONE_OUTLINE_LAYER_ID);
      if (map.getLayer(ZONE_FILL_LAYER_ID)) map.removeLayer(ZONE_FILL_LAYER_ID);
      if (map.getSource(ZONE_SOURCE_ID)) map.removeSource(ZONE_SOURCE_ID);
    };
  }, [controller, status]);

  return null;
}
