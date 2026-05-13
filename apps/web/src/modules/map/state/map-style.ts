import { atom } from 'nanostores';

/**
 * Map style engine.
 *
 * Seven operator-facing modes, each a combination of one base raster
 * layer and zero or more overlay raster layers. The same MapLibre
 * style holds every raster source at once; the switcher toggles
 * layer visibility instead of rebuilding the style, so vessel and
 * trail vector layers stay mounted continuously and the visual
 * transition is a single render frame, not a re-init flash.
 *
 * Base sources come from a mix of providers: OSM Mapnik + CARTO Dark
 * Matter for the OSM pair (no key), Esri ArcGIS Online for the USGS
 * mirror pair (no key, EU CDN), MapTiler for Tactical / Backdrop /
 * Satellite (VITE_MAPTILER_KEY inlined at build time, origin-locked
 * on the MapTiler side).
 *
 * Adding an eighth mode would mean: register a new MapStyleId here,
 * declare the source + layer in osm-raster-style.ts, list its base
 * and overlay layer ids in the descriptor, add an icon entry in the
 * switcher. Nothing else changes.
 */

export const MAP_STYLE_IDS = [
  'osm-dark',
  'osm-light',
  'usgs-imagery-topo',
  'usgs-topo',
  'tactical',
  'backdrop',
  'satellite',
] as const;
export type MapStyleId = (typeof MAP_STYLE_IDS)[number];

export type MapStyleDescriptor = {
  readonly id: MapStyleId;
  readonly label: string;
  readonly description: string;
  /** Single base raster layer that is visible in this mode. */
  readonly baseLayerId: string;
  /** Overlay raster layers visible on top of the base in this mode. */
  readonly overlayLayerIds: readonly string[];
};

export const MAP_STYLE_REGISTRY: Record<MapStyleId, MapStyleDescriptor> = {
  'osm-dark': {
    id: 'osm-dark',
    label: 'OSM Dark',
    description:
      'CARTO Dark Matter - OpenStreetMap data, dark palette, EU CDN with fast tile delivery.',
    baseLayerId: 'base-osm-dark',
    overlayLayerIds: ['overlay-seamark'],
  },
  'osm-light': {
    id: 'osm-light',
    label: 'OSM Light',
    description: 'OpenStreetMap Standard - classic Mapnik raster with full street and POI detail.',
    baseLayerId: 'base-osm-light',
    overlayLayerIds: ['overlay-seamark'],
  },
  'usgs-imagery-topo': {
    id: 'usgs-imagery-topo',
    label: 'USGS Imagery + Topo',
    description:
      'Esri World Imagery served from the global ArcGIS CDN - high-resolution satellite worldwide.',
    baseLayerId: 'base-usgs-imagery-topo',
    overlayLayerIds: ['overlay-seamark'],
  },
  'usgs-topo': {
    id: 'usgs-topo',
    label: 'USGS Topo',
    description:
      'USGS World Topo via Esri ArcGIS CDN - global topographic raster with terrain, roads, place names and contours. Same Esri-USGS partnership pipeline as USGS Imagery; deep zoom (z0-19), fast from EU.',
    baseLayerId: 'base-usgs-topo',
    overlayLayerIds: ['overlay-seamark'],
  },
  tactical: {
    id: 'tactical',
    label: 'Tactical',
    description: 'MapTiler Dataviz Dark - maximum contrast for live vessel monitoring.',
    baseLayerId: 'base-tactical',
    overlayLayerIds: ['overlay-seamark'],
  },
  backdrop: {
    id: 'backdrop',
    label: 'Backdrop',
    description: 'MapTiler Backdrop Dark - minimalist dark base for clean data overlay.',
    baseLayerId: 'base-backdrop',
    overlayLayerIds: ['overlay-seamark'],
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    description: 'MapTiler Sentinel-2 satellite imagery with seamark overlay.',
    baseLayerId: 'base-satellite',
    overlayLayerIds: ['overlay-seamark'],
  },
};

/** Every base layer the style spec declares; used for the off-toggle loop. */
export const ALL_BASE_LAYER_IDS: readonly string[] = MAP_STYLE_IDS.map(
  id => MAP_STYLE_REGISTRY[id].baseLayerId,
);

/** Every overlay layer the style spec declares; used for the off-toggle loop. */
export const ALL_OVERLAY_LAYER_IDS = ['overlay-seamark'] as const;

export const DEFAULT_MAP_STYLE: MapStyleId = 'osm-light';

export const $activeMapStyle = atom<MapStyleId>(DEFAULT_MAP_STYLE);

export function setMapStyle(id: MapStyleId): void {
  $activeMapStyle.set(id);
}

export function isMapStyleId(value: unknown): value is MapStyleId {
  return typeof value === 'string' && (MAP_STYLE_IDS as readonly string[]).includes(value);
}
