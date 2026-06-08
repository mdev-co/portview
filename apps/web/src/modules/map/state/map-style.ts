import { atom } from 'nanostores';
import {
  BASE_BACKDROP_LAYER_ID,
  BASE_OSM_DARK_LAYER_ID,
  BASE_OSM_LIGHT_LAYER_ID,
  BASE_PRESENTATION_LAYER_ID,
  BASE_SATELLITE_LAYER_ID,
  BASE_TACTICAL_LAYER_ID,
  BASE_USGS_IMAGERY_TOPO_LAYER_ID,
  BASE_USGS_TOPO_LAYER_ID,
  PORT_GREEN_LAYER_ID,
  PORT_WATER_LAYER_ID,
  PORT_WATER_OUTLINE_LAYER_ID,
  PRESENTATION_GRID_LAYER_ID,
  PRESENTATION_GRID_MAJOR_LAYER_ID,
  SEAMARK_OVERLAY_LAYER_ID,
} from '../styles/osm-raster-style';

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
  'presentation',
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
    baseLayerId: BASE_OSM_DARK_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  'osm-light': {
    id: 'osm-light',
    label: 'OSM Light',
    description: 'OpenStreetMap Standard - classic Mapnik raster with full street and POI detail.',
    baseLayerId: BASE_OSM_LIGHT_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  'usgs-imagery-topo': {
    id: 'usgs-imagery-topo',
    label: 'USGS Imagery + Topo',
    description:
      'Esri World Imagery served from the global ArcGIS CDN - high-resolution satellite worldwide.',
    baseLayerId: BASE_USGS_IMAGERY_TOPO_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  'usgs-topo': {
    id: 'usgs-topo',
    label: 'USGS Topo',
    description:
      'USGS World Topo via Esri ArcGIS CDN - global topographic raster with terrain, roads, place names and contours. Same Esri-USGS partnership pipeline as USGS Imagery; deep zoom (z0-19), fast from EU.',
    baseLayerId: BASE_USGS_TOPO_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  tactical: {
    id: 'tactical',
    label: 'Tactical',
    description: 'MapTiler Dataviz Dark - maximum contrast for live vessel monitoring.',
    baseLayerId: BASE_TACTICAL_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  backdrop: {
    id: 'backdrop',
    label: 'Backdrop',
    description: 'MapTiler Backdrop Dark - minimalist dark base for clean data overlay.',
    baseLayerId: BASE_BACKDROP_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    description: 'MapTiler Sentinel-2 satellite imagery with seamark overlay.',
    baseLayerId: BASE_SATELLITE_LAYER_ID,
    overlayLayerIds: [SEAMARK_OVERLAY_LAYER_ID],
  },
  presentation: {
    id: 'presentation',
    label: 'Presentation',
    description:
      'CARTO Positron No Labels - greyscale chart with every street and place name stripped. Optimised for the Airspace-Intelligence-style demo view: the basemap reads as pure topology, water and green overlays carry the colour budget, and 3D flagship models pop on top.',
    baseLayerId: BASE_PRESENTATION_LAYER_ID,
    // Grid was previously presentation-exclusive — now it is a global
    // overlay gated by the `$gridVisible` atom and reachable from any
    // map style via the dedicated toolbar button. Water and green
    // overlays remain presentation-exclusive (their colour palette
    // assumes the dim Positron base); seamarks follow the global
    // `$seamarkVisible` toggle as on every other style.
    overlayLayerIds: [
      PORT_GREEN_LAYER_ID,
      PORT_WATER_LAYER_ID,
      PORT_WATER_OUTLINE_LAYER_ID,
      SEAMARK_OVERLAY_LAYER_ID,
    ],
  },
};

/** Every base layer the style spec declares; used for the off-toggle loop. */
export const ALL_BASE_LAYER_IDS: readonly string[] = MAP_STYLE_IDS.map(
  id => MAP_STYLE_REGISTRY[id].baseLayerId,
);

/**
 * Global overlays that are NOT tied to a specific map-style descriptor —
 * the sync hook walks these alongside the descriptor's own overlay list
 * so a toolbar toggle can flip them on/off regardless of the active
 * style. Currently just the coordinate grid; add new entries here if
 * future overlays should also live "outside" the style switcher.
 */
const GLOBAL_OVERLAY_LAYER_IDS: readonly string[] = [
  PRESENTATION_GRID_LAYER_ID,
  PRESENTATION_GRID_MAJOR_LAYER_ID,
];

/**
 * Every overlay layer the style spec declares — descriptor-bound ones
 * plus global ones. The off-toggle loop in `useMapStyleSync` walks
 * this list so adding an overlay to any descriptor or to the global
 * list above is a single-edit change.
 */
export const ALL_OVERLAY_LAYER_IDS: readonly string[] = Array.from(
  new Set([
    ...MAP_STYLE_IDS.flatMap(id => MAP_STYLE_REGISTRY[id].overlayLayerIds),
    ...GLOBAL_OVERLAY_LAYER_IDS,
  ]),
);

export const DEFAULT_MAP_STYLE: MapStyleId = 'presentation';

export const $activeMapStyle = atom<MapStyleId>(DEFAULT_MAP_STYLE);

export function setMapStyle(id: MapStyleId): void {
  $activeMapStyle.set(id);
}

export function isMapStyleId(value: unknown): value is MapStyleId {
  return typeof value === 'string' && (MAP_STYLE_IDS as readonly string[]).includes(value);
}
