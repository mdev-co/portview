import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { SHIP_TYPE_CATEGORIES } from '@sps/shared';
import {
  VESSEL_CATEGORY_PALETTE,
  VESSEL_CATEGORY_RING_PALETTE,
  VESSEL_PALETTE,
  VESSEL_UNDERWAY_RING_HEX,
} from './vessel-palette';

export const VESSEL_SOURCE_ID = 'vessels';
export const VESSEL_LAYER_ID = 'vessels-circles';
export const VESSEL_ARROW_LAYER_ID = 'vessels-arrows';
export const VESSEL_LABEL_LAYER_ID = 'vessels-labels';
export const VESSEL_ICON_CARGO_ID = 'vessel-icon-cargo';
export const VESSEL_ICON_PASSENGER_ID = 'vessel-icon-passenger';
export const VESSEL_ICON_SMALL_ID = 'vessel-icon-small';
export const VESSEL_SELECTION_RING_ID = 'vessel-selection-ring-icon';
export const VESSEL_SELECTION_RING_LAYER_ID = 'vessels-selection-ring';
export const VESSEL_UNSELECTED_RING_ID = 'vessel-unselected-ring-icon';
export const VESSEL_UNSELECTED_RING_LAYER_ID = 'vessels-unselected-ring';
export const VESSEL_LABEL_BG_ID = 'vessel-label-bg-icon';
export const VESSEL_TRAIL_SOURCE_ID = 'vessel-trails';
export const VESSEL_TRAIL_LAYER_ID = 'vessels-trails';

/**
 * Per-category top-down ship silhouette selector. Cargo and tanker
 * read as freighter; passenger / sailing / other read as medium
 * vessel; fishing and service read as small craft. Falls back to
 * the medium passenger shape for unknown categories.
 */
const ICON_BY_CATEGORY: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  'cargo',
  VESSEL_ICON_CARGO_ID,
  'tanker',
  VESSEL_ICON_CARGO_ID,
  'passenger',
  VESSEL_ICON_PASSENGER_ID,
  'sailing',
  VESSEL_ICON_PASSENGER_ID,
  'other',
  VESSEL_ICON_PASSENGER_ID,
  'fishing',
  VESSEL_ICON_SMALL_ID,
  'service',
  VESSEL_ICON_SMALL_ID,
  VESSEL_ICON_PASSENGER_ID,
];

const categoryMatchPairs: string[] = SHIP_TYPE_CATEGORIES.flatMap(c => [
  c,
  VESSEL_CATEGORY_PALETTE[c].hex,
]);

// MapLibre's ExpressionSpecification is a discriminated tuple union that the
// TS compiler cannot narrow from a spread; the runtime shape is correct
// (alternating string keys + values, hex fallback at the tail).
const colorByCategory = [
  'match',
  ['get', 'category'],
  ...categoryMatchPairs,
  VESSEL_CATEGORY_PALETTE.other.hex,
] as unknown as ExpressionSpecification;

// A vessel under way (SOG > IS_MOVING threshold encoded into the flags
// upstream) takes the underway green fill so the eye picks up movement
// before it picks up category. Stationary vessels keep the category
// colour so anchored fleets stay legible at a glance.
const fillColorByMovementAndCategory: ExpressionSpecification = [
  'case',
  ['boolean', ['get', 'isMoving'], false],
  VESSEL_PALETTE.underway.hex,
  colorByCategory,
];

// Neon-feel ring companion expression. Same shape as the fill
// expression above but pulls from the brighter ring palette (400/500
// tier) so the dashed ring reads as a glowing outline one shade
// lighter than the 500/600-tier fill body - "neon outline on a
// saturated body" rather than dark silhouette on pastel.
const ringCategoryMatchPairs: string[] = SHIP_TYPE_CATEGORIES.flatMap(c => [
  c,
  VESSEL_CATEGORY_RING_PALETTE[c].hex,
]);

const ringColorByCategory = [
  'match',
  ['get', 'category'],
  ...ringCategoryMatchPairs,
  VESSEL_CATEGORY_RING_PALETTE.other.hex,
] as unknown as ExpressionSpecification;

const ringColorByMovementAndCategory: ExpressionSpecification = [
  'case',
  ['boolean', ['get', 'isMoving'], false],
  VESSEL_UNDERWAY_RING_HEX,
  ringColorByCategory,
];

const isSelected: ExpressionSpecification = ['boolean', ['get', 'selected'], false];

/**
 * A fix older than the dead-reckoning freshness window (90s) but younger
 * than the TTL eviction boundary (600s) gets a visibly dimmed stroke so
 * the operator can tell at a glance that the position is no longer
 * being smoothly interpolated. Threshold sits between the two so a
 * freshly frozen marker fades earlier than the opacity ramp by itself
 * would suggest. Selection wins over staleness (operator picked this
 * vessel, we keep the amber ring regardless).
 */
const STALE_FIX_AGE_SECONDS = 120;
const isStaleFix: ExpressionSpecification = ['>=', ['get', 'ageSeconds'], STALE_FIX_AGE_SECONDS];

const STALE_STROKE_HEX = '#94a3b8';

// Selection is signalled by a separate dashed-ring symbol layer rendered
// on top of the marker (see VESSEL_SELECTION_RING_LAYER_ID below). The
// marker's own stroke therefore never changes colour on select - it
// stays slate-900 (dark contour on light bases, navy line on dark
// bases) or shifts to dim slate for stale fixes. One contour, two
// states, no amber on the marker itself.
const strokeColorByStaleness: ExpressionSpecification = [
  'case',
  isStaleFix,
  STALE_STROKE_HEX,
  VESSEL_PALETTE.markerOutline.hex,
];

/**
 * Opacity ramp aligned with the TTL eviction boundary in `vessels.store`
 * (STALE_THRESHOLD_SECONDS = 600s). Reaches 0.0 at 600s so the marker
 * fades to invisible exactly at the moment the store evicts it - no
 * sudden disappearance from full-ish opacity.
 */
const opacityByAge: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'ageSeconds'],
  0,
  0.95,
  60,
  0.92,
  180,
  0.7,
  360,
  0.45,
  540,
  0.15,
  600,
  0,
];

export const osmRasterStyle: StyleSpecification = {
  version: 8,
  /**
   * Eight raster sources cover seven map style modes plus the seamark
   * overlay. Four are public XYZ endpoints with no key (OpenStreetMap
   * Standard, CARTO Dark Matter, Esri World Topo, Esri World Imagery);
   * the remaining three are MapTiler maps that read the inlined
   * VITE_MAPTILER_KEY (Tactical Dataviz Dark, Backdrop Dark, Sentinel-2
   * Satellite). MapTiler enforces an origin allowlist on the key so the
   * public inlined key is only useful from approved origins.
   *
   * WebP tile format saves ~40-50% bandwidth versus PNG for the
   * MapTiler tiles; OSM / CARTO / Esri stay on their native PNG since
   * those providers do not vend a WebP variant.
   */
  sources: {
    'osm-mapnik': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '\u00a9 OpenStreetMap contributors',
      maxzoom: 19,
    },
    'carto-dark-matter': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
      maxzoom: 20,
    },
    /**
     * Esri ArcGIS Online tile services - served from Esri's global
     * CloudFront CDN with EU POPs (~30-50ms from PL vs ~250-400ms
     * direct to basemap.nationalmap.gov US-East). World_Imagery is
     * the satellite base; World_Topo_Map is the global topographic
     * raster with terrain, roads, place names and contours - same
     * Esri-USGS partnership pipeline that powers USGSImageryTopo,
     * deep zoom (z0-19).
     */
    'esri-world-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles \u00a9 Esri \u2014 Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxzoom: 19,
    },
    'esri-world-topo': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles \u00a9 Esri \u2014 Esri, HERE, Garmin, INCREMENT P, NGA, USGS',
      maxzoom: 19,
    },
    'maptiler-dataviz-dark': {
      type: 'raster',
      tiles: [
        `https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.webp?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`,
      ],
      tileSize: 256,
      attribution: '\u00a9 MapTiler \u00a9 OpenStreetMap contributors',
      maxzoom: 22,
    },
    'maptiler-backdrop-dark': {
      type: 'raster',
      tiles: [
        `https://api.maptiler.com/maps/backdrop-dark/{z}/{x}/{y}.webp?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`,
      ],
      tileSize: 256,
      attribution: '\u00a9 MapTiler \u00a9 OpenStreetMap contributors',
      maxzoom: 22,
    },
    'maptiler-satellite': {
      type: 'raster',
      tiles: [
        `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`,
      ],
      tileSize: 256,
      attribution: '\u00a9 MapTiler \u00a9 Sentinel-2 cloudless ESA',
      maxzoom: 20,
    },
    seamark: {
      type: 'raster',
      tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '\u00a9 OpenSeaMap contributors',
      maxzoom: 18,
    },
    [VESSEL_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    [VESSEL_TRAIL_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  layers: [
    /**
     * Base raster layers. Exactly one is `visible` per active mode;
     * the map-style sync hook toggles `layout.visibility` on switch.
     * Initial state reflects DEFAULT_MAP_STYLE = 'osm-light' so the
     * OpenStreetMap Mapnik base is the only one fetched on first paint.
     */
    {
      id: 'base-osm-dark',
      type: 'raster',
      source: 'carto-dark-matter',
      layout: { visibility: 'none' },
    },
    {
      id: 'base-osm-light',
      type: 'raster',
      source: 'osm-mapnik',
      layout: { visibility: 'visible' },
    },
    {
      id: 'base-usgs-imagery-topo',
      type: 'raster',
      source: 'esri-world-imagery',
      layout: { visibility: 'none' },
    },
    {
      id: 'base-usgs-topo',
      type: 'raster',
      source: 'esri-world-topo',
      layout: { visibility: 'none' },
    },
    {
      id: 'base-tactical',
      type: 'raster',
      source: 'maptiler-dataviz-dark',
      layout: { visibility: 'none' },
    },
    {
      id: 'base-backdrop',
      type: 'raster',
      source: 'maptiler-backdrop-dark',
      layout: { visibility: 'none' },
    },
    {
      id: 'base-satellite',
      type: 'raster',
      source: 'maptiler-satellite',
      layout: { visibility: 'none' },
    },
    /**
     * Seamark overlay. Drawn at reduced opacity and gated above zoom
     * 9 so the marker density at country / region zoom does not
     * dominate the map; at port zoom (z >= 13) the channel markers,
     * lights and anchorage symbols read as context for the AIS
     * vessels rendered on top.
     */
    {
      id: 'overlay-seamark',
      type: 'raster',
      source: 'seamark',
      minzoom: 9,
      // Off by default - the operator opts in via the seamark toggle.
      // OpenSeaMap symbols at country / region zoom add visual noise
      // before the user has indicated they want it; the toggle is a
      // single click away. The sync hook flips this to 'visible' when
      // $seamarkVisible reads true.
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.7 },
    },
    // Trail layer renders the last N positions per vessel as a fading
    // polyline. Drawn before vessel markers so the marker sits on top
    // of its own track.
    {
      id: VESSEL_TRAIL_LAYER_ID,
      type: 'line',
      source: VESSEL_TRAIL_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': fillColorByMovementAndCategory,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 1.8, 18, 2.4],
        'line-opacity': ['case', isSelected, 0.85, 0.45],
      },
    },
    /**
     * Unselected helper ring. A dotted circle tinted per-feature with
     * the vessel's own fill colour (cargo blue, sailing cyan, fishing
     * indigo, etc.) painted under every vessel that is NOT currently
     * selected. The matching hue keeps the ring "delicate but
     * meaningful" - it reads as a halo of the same vessel rather
     * than a neutral marker - while staying visually distinct from
     * the amber selection ring through a thinner line, tighter dash
     * pattern and smaller footprint. Opacity fades from full at
     * panorama zoom to zero by port detail, by which point the ship
     * silhouette and stroke carry the legibility on their own.
     */
    {
      id: VESSEL_UNSELECTED_RING_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      filter: ['!', ['boolean', ['get', 'selected'], false]],
      layout: {
        'icon-image': VESSEL_UNSELECTED_RING_ID,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'viewport',
        // Ring footprint sits ~8-12 px outside the ship silhouette.
        // The slight bump over a pure "fit the ship" radius matters at
        // panorama zoom (z8) where the silhouette itself is only ~22
        // px - a tighter ring would visually merge with it.
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 11, 0.65, 14, 0.7, 18, 0.8],
      },
      paint: {
        // Neon-feel ring shade - same hue family as the fill but one
        // Tailwind tier brighter. Sits as a glowing outline around
        // the saturated 500/600 fill body; thick 4 px canvas stroke
        // keeps it visible on cream OSM Mapnik even at the lighter
        // shade. Selected vessels still wear the amber ring on top.
        'icon-color': ringColorByMovementAndCategory,
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.95, 11, 0.8, 13, 0.4, 14, 0],
      },
    },
    {
      id: VESSEL_LAYER_ID,
      type: 'circle',
      source: VESSEL_SOURCE_ID,
      filter: ['!', ['get', 'hasHeading']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8, 18, 13],
        'circle-color': fillColorByMovementAndCategory,
        // Outline thickness ramps from a hairline at far-out zooms to
        // a full 2 px at port detail. A constant 2 px at z8 painted a
        // dark slate rectangle around every tiny dot because the
        // outline area dominated the few pixels left after icon-size
        // and circle-radius scaling - the same artefact the SDF halo
        // produced. One ramp, both layers, no visual "boxes".
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 11, 1, 14, 2, 18, 2],
        'circle-stroke-color': strokeColorByStaleness,
        'circle-opacity': opacityByAge,
        'circle-stroke-opacity': opacityByAge,
      },
    },
    {
      id: VESSEL_ARROW_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      filter: ['get', 'hasHeading'],
      layout: {
        'icon-image': ICON_BY_CATEGORY,
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
        'icon-rotate': ['get', 'heading'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 14, 0.45, 18, 0.65],
      },
      paint: {
        'icon-color': fillColorByMovementAndCategory,
        'icon-opacity': opacityByAge,
        // No icon-halo - earlier slate-900 halo around the SDF
        // silhouette produced visible step artefacts as MapLibre
        // sampled the distance field at small icon-size. The
        // saturated fill plus the neon ring carry the contrast now.
      },
    },
    /**
     * Selection ring. A non-SDF amber dashed circle rendered on top
     * of the marker for the one vessel whose `selected` flag is true.
     * `icon-rotation-alignment: viewport` keeps the dash pattern
     * upright as the operator pans / rotates the map; the marker
     * underneath rotates with heading independently.
     */
    {
      id: VESSEL_SELECTION_RING_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      filter: ['boolean', ['get', 'selected'], false],
      layout: {
        'icon-image': VESSEL_SELECTION_RING_ID,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'viewport',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 14, 0.7, 18, 1.0],
      },
    },
    {
      id: VESSEL_LABEL_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      minzoom: 10,
      layout: {
        // Show the vessel name when available, otherwise the MMSI as a
        // fallback. Class B vessels often arrive without a name until
        // a type 24 PartA frame lands, and AisStream's sub-sampling can
        // mean PartA never reaches us; a numeric MMSI badge is more
        // useful than an unlabelled marker. The icon is a stretchable
        // dark plate (slate-900 / 0.85 alpha) that MapLibre auto-fits
        // to the text bounds, turning every label into a compact
        // badge that reads on any base map without competing with the
        // vessel's neon ring.
        'icon-image': VESSEL_LABEL_BG_ID,
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 6, 2, 6],
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'text-field': ['case', ['has', 'name'], ['get', 'name'], ['to-string', ['get', 'mmsi']]],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 12, 18, 14],
        'text-offset': [0, 1.6],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
        'text-padding': 4,
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#ffffff',
        'text-opacity': opacityByAge,
        'icon-opacity': opacityByAge,
      },
    },
  ],
};
