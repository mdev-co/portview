import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { SHIP_TYPE_CATEGORIES, type ShipTypeCategory } from '@sps/shared';
import { opacityBySource } from './source-palette';
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
 * Base raster layer ids. Each id labels exactly one entry in the
 * style spec's `layers` array below and is referenced from the
 * matching descriptor in `state/map-style.ts` as `baseLayerId`. The
 * sync hook walks every id in `ALL_BASE_LAYER_IDS` on style switch.
 * One symbol per layer; renaming touches the export, not two files.
 */
export const BASE_OSM_DARK_LAYER_ID = 'base-osm-dark' as const;
export const BASE_OSM_LIGHT_LAYER_ID = 'base-osm-light' as const;
export const BASE_USGS_IMAGERY_TOPO_LAYER_ID = 'base-usgs-imagery-topo' as const;
export const BASE_USGS_TOPO_LAYER_ID = 'base-usgs-topo' as const;
export const BASE_TACTICAL_LAYER_ID = 'base-tactical' as const;
export const BASE_BACKDROP_LAYER_ID = 'base-backdrop' as const;
export const BASE_SATELLITE_LAYER_ID = 'base-satellite' as const;
export const BASE_PRESENTATION_LAYER_ID = 'base-presentation' as const;

/**
 * OpenSeaMap raster overlay layer id. Declared once here next to the
 * style-spec source/layer definitions and re-exported through the
 * state module so the descriptor list, the sync hook and the
 * seamark-visibility atom all reference one symbol. A rename or move
 * of the overlay now touches a single export, not four files.
 */
export const SEAMARK_OVERLAY_LAYER_ID = 'overlay-seamark' as const;

/**
 * Grid overlay shown only in the Presentation map mode. Reads as a
 * mission-control coordinate grid, reinforcing the Airspace
 * Intelligence look without competing with the actual chart content.
 * The lines themselves are generated below from a regular lat/lng
 * raster covering the Szczecin operating area at ~0.005 deg spacing
 * (~350 m at this latitude).
 */
export const PRESENTATION_GRID_SOURCE_ID = 'presentation-grid' as const;
export const PRESENTATION_GRID_LAYER_ID = 'overlay-presentation-grid' as const;
export const PRESENTATION_GRID_MAJOR_LAYER_ID = 'overlay-presentation-grid-major' as const;

/**
 * 3D port buildings overlay. Real OpenStreetMap building footprints
 * (top 30 by height inside the Szczecin port bbox) baked into a
 * static GeoJSON shipped from `public/port-buildings.geojson`. Source
 * is the same OSM dataset that powers the basemap raster, so the
 * fill-extrusion bases land pixel-perfect on the building outlines
 * visible in the tile pyramid — no eye-balled coordinate drift. The
 * height filter (>= 15 m after `building:levels * 3` fallback) keeps
 * residential sheds out and leaves the tall skyline: Hanza Tower,
 * Elewator Ewa, Wieża Węglowa and the riverfront landmark stack.
 * Each feature carries a single property `h` (rounded metres) so the
 * paint expression reads it directly without an OSM-tag fallback
 * dance at draw time.
 */
export const PORT_BUILDINGS_SOURCE_ID = 'port-buildings' as const;
export const PORT_BUILDINGS_LAYER_ID = 'overlay-port-buildings' as const;
export const PORT_BUILDINGS_SHADOW_LAYER_ID = 'overlay-port-buildings-shadow' as const;
const PORT_BUILDINGS_DATA_URL = '/port-buildings.geojson' as const;

/**
 * Water overlay exclusive to the Presentation map mode. Real OSM water
 * polygons (`natural=water` + `waterway=riverbank` ways and relations)
 * baked into a static GeoJSON shipped from `public/port-water.geojson`.
 * Bbox covers the whole Szczecin–Świnoujście corridor (53.30–53.95 /
 * 14.30–14.85) so the Odra channel, harbour basins, Dąbie lake, Zalew
 * Szczeciński and the Świna delta all paint as water. Polygons under
 * 50 000 m² are dropped and the rest are simplified with Douglas-
 * Peucker at ~67 m tolerance, so the wire-size stays around 770 KB
 * uncompressed / ~190 KB gzipped while every visually-meaningful
 * basin survives. The sync hook gates visibility per mode via
 * `MAP_STYLE_REGISTRY`.
 */
export const PORT_WATER_SOURCE_ID = 'port-water' as const;
export const PORT_WATER_LAYER_ID = 'overlay-port-water' as const;
export const PORT_WATER_OUTLINE_LAYER_ID = 'overlay-port-water-outline' as const;
const PORT_WATER_DATA_URL = '/port-water.geojson' as const;

/**
 * Green-space overlay exclusive to the Presentation map mode. Real
 * OSM polygons for parks, gardens, forests, woods, meadows,
 * allotments and recreation grounds inside the port bbox shipped from
 * `public/port-green.geojson`. Each feature carries a `k` property
 * (`forest` | `park` | `green`) so the fill expression tints darker
 * sage for tree cover, lighter sage for urban parks, neutral sage
 * for the rest. Tiny `grass` roadside verges are filtered out
 * upstream because 3000+ road-strip polygons would dominate the
 * chart and overwhelm vessel layers.
 */
export const PORT_GREEN_SOURCE_ID = 'port-green' as const;
export const PORT_GREEN_LAYER_ID = 'overlay-port-green' as const;
const PORT_GREEN_DATA_URL = '/port-green.geojson' as const;

/**
 * Age threshold above which a vessel's stroke colour shifts to the
 * dim slate tone, signalling "fix is past the dead-reckoning freshness
 * window". Sits between the dead-reckoning freeze (90 s) and the TTL
 * eviction boundary (600 s in `vessels.store`).
 */
const STALE_FIX_AGE_SECONDS = 120;

/** Stroke colour applied once a vessel's fix crosses STALE_FIX_AGE_SECONDS. */
const STALE_STROKE_HEX = '#94a3b8';

/**
 * Build a base raster layer entry for the style spec. Every base mode
 * shares the same shape (id + source + initial visibility); exactly
 * one starts `'visible'` and the rest start `'none'` so MapLibre
 * fetches only the active mode's tiles on first paint. The sync hook
 * toggles `layout.visibility` as the operator changes modes.
 */
function makeBaseRasterLayer(
  id: string,
  source: string,
  visibility: 'visible' | 'none',
): LayerSpecification {
  return {
    id,
    type: 'raster',
    source,
    layout: { visibility },
  };
}

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

/**
 * Build a MapLibre `match` expression that maps a vessel's `category`
 * attribute to a hex colour from the supplied palette, falling back
 * to the palette's `other` entry for any unrecognised category.
 *
 * MapLibre's `ExpressionSpecification` is a discriminated tuple union
 * that the TS compiler cannot narrow from a `flatMap` spread; the
 * runtime shape is correct (alternating string keys + colour outputs,
 * hex fallback at the tail) so the single `as` is the documented
 * boundary cast for this DSL, not a workaround for a deeper bug.
 */
function buildCategoryColorMatchExpression(
  palette: Readonly<Record<ShipTypeCategory, { readonly hex: string }>>,
): ExpressionSpecification {
  const expression: unknown[] = ['match', ['get', 'category']];
  for (const category of SHIP_TYPE_CATEGORIES) {
    expression.push(category, palette[category].hex);
  }
  expression.push(palette.other.hex);
  return expression as ExpressionSpecification;
}

const colorByCategory = buildCategoryColorMatchExpression(VESSEL_CATEGORY_PALETTE);

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
const ringColorByCategory = buildCategoryColorMatchExpression(VESSEL_CATEGORY_RING_PALETTE);

const ringColorByMovementAndCategory: ExpressionSpecification = [
  'case',
  ['boolean', ['get', 'isMoving'], false],
  VESSEL_UNDERWAY_RING_HEX,
  ringColorByCategory,
];

const isSelected: ExpressionSpecification = ['boolean', ['get', 'selected'], false];

/**
 * A fix older than the dead-reckoning freshness window (90 s) but younger
 * than the TTL eviction boundary (600 s) gets a visibly dimmed stroke so
 * the operator can tell at a glance that the position is no longer being
 * smoothly interpolated. Selection wins over staleness (operator picked
 * this vessel, we keep the amber ring regardless).
 */
const isStaleFix: ExpressionSpecification = ['>=', ['get', 'ageSeconds'], STALE_FIX_AGE_SECONDS];

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

/**
 * Combined opacity: the age ramp above multiplied by the source-based
 * multiplier from `source-palette`. A vessel that is both fresh AND
 * EdgeBridge-owned renders at 0.95; a fresh AisStream vessel renders at
 * 0.95 * 0.55 = 0.52; both fade to zero in lockstep at the staleness
 * boundary. Single expression so every vessel layer (circles, arrows,
 * labels) shares the exact same fade.
 */
const opacityCombined: ExpressionSpecification = ['*', opacityByAge, opacityBySource];

/**
 * Viewport-driven coordinate grid. The grid source is initialised
 * empty here; `useDynamicGrid` regenerates the lines for the visible
 * viewport on every `moveend`, picking a zoom-keyed step so the same
 * overlay reads correctly from world view down to berth-level zoom.
 * Each feature carries a `tier` property ('major' | 'minor') so two
 * paint layers in the style spec can render one source with two
 * weights — the classic ATC / operator chart look.
 */
export type GridViewportParams = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
  readonly minorStep: number;
  readonly majorEvery: number;
  readonly padding: number;
};

export function buildGridForViewport(
  p: GridViewportParams,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const padW = (p.east - p.west) * p.padding;
  const padH = (p.north - p.south) * p.padding;
  const w = p.west - padW;
  const e = p.east + padW;
  const s = p.south - padH;
  const n = p.north + padH;

  const lat0 = Math.floor(s / p.minorStep) * p.minorStep;
  const lat1 = Math.ceil(n / p.minorStep) * p.minorStep;
  const lng0 = Math.floor(w / p.minorStep) * p.minorStep;
  const lng1 = Math.ceil(e / p.minorStep) * p.minorStep;

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let lat = lat0; lat <= lat1 + 1e-9; lat += p.minorStep) {
    // Tier is keyed off absolute index from origin (not iteration
    // count) so the SAME parallel always renders as major across pans
    // — otherwise the major/minor pattern would shift each frame.
    const idx = Math.round(lat / p.minorStep);
    const tier = idx % p.majorEvery === 0 ? 'major' : 'minor';
    features.push({
      type: 'Feature',
      properties: { axis: 'parallel', tier },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng0, lat],
          [lng1, lat],
        ],
      },
    });
  }
  for (let lng = lng0; lng <= lng1 + 1e-9; lng += p.minorStep) {
    const idx = Math.round(lng / p.minorStep);
    const tier = idx % p.majorEvery === 0 ? 'major' : 'minor';
    features.push({
      type: 'Feature',
      properties: { axis: 'meridian', tier },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng, lat0],
          [lng, lat1],
        ],
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

const EMPTY_GRID_GEOJSON: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [],
};

export const osmRasterStyle: StyleSpecification = {
  version: 8,
  /**
   * MapLibre 5 sky + fog. Renders behind the world geometry with full
   * knowledge of the camera matrix (pitch, fov, zoom), so the horizon
   * sits on the actual horizon line of the projection - NOT on a fixed
   * fraction of the screen the way a CSS pseudo-element does. The
   * fog-ground-blend value controls how far the haze creeps down onto
   * the basemap tiles, softening the seam where the rendered world
   * meets the rendered sky; the resulting gradient travels with the
   * camera as the operator pitches or zooms. The container `<div>`
   * keeps its CSS gradient as a backstop for the rare case where the
   * sky paint pass is skipped (WebGL context lost, etc.).
   */
  sky: {
    // Calibrated to the dim base (brightness 0.65): deeper sky and
    // horizon tones so the atmosphere does not visually outshine the
    // chart. Fog blend pushes higher than the middle-ground variant
    // to keep aerial perspective alive against the dim ground.
    'sky-color': '#3e577a',
    'sky-horizon-blend': 0.55,
    'horizon-color': '#a8bbcb',
    'horizon-fog-blend': 0.62,
    'fog-color': '#c4d0db',
    'fog-ground-blend': 0.4,
    'atmosphere-blend': 0.9,
  },
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
    /**
     * Carto "Positron No Labels" - greyscale OSM raster with every
     * place / road label stripped. Ideal Airspace-Intelligence-style
     * presentation backdrop: the chart reads as topology only, all
     * attention budget goes to the live actors (vessels, zones,
     * flagship 3D models). Same EU CDN as the other CARTO tiles.
     */
    'carto-positron-nolabels': {
      type: 'raster',
      // CARTO free basemaps started serving "API KEY REQUIRED"-watermarked
      // tiles (policy change); swapped to MapTiler dataviz-light on the same
      // origin-locked key the tactical/backdrop/satellite modes already use.
      tiles: [
        `https://api.maptiler.com/maps/dataviz-light/{z}/{x}/{y}.webp?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`,
      ],
      tileSize: 256,
      attribution: '\u00a9 MapTiler \u00a9 OpenStreetMap contributors',
      maxzoom: 22,
    },
    [PRESENTATION_GRID_SOURCE_ID]: {
      type: 'geojson',
      data: EMPTY_GRID_GEOJSON,
    },
    [PORT_BUILDINGS_SOURCE_ID]: {
      type: 'geojson',
      data: PORT_BUILDINGS_DATA_URL,
    },
    [PORT_WATER_SOURCE_ID]: {
      type: 'geojson',
      data: PORT_WATER_DATA_URL,
    },
    [PORT_GREEN_SOURCE_ID]: {
      type: 'geojson',
      data: PORT_GREEN_DATA_URL,
    },
    'carto-dark-matter': {
      type: 'raster',
      // Same CARTO watermark issue as above; dataviz-dark matches the old
      // Dark Matter look closest and is already a proven source in this file.
      tiles: [
        `https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.webp?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`,
      ],
      tileSize: 256,
      attribution: '\u00a9 MapTiler \u00a9 OpenStreetMap contributors',
      maxzoom: 22,
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
     * Initial state reflects DEFAULT_MAP_STYLE = 'presentation' so the
     * CARTO Positron no-labels base is the only one fetched on first
     * paint and the operator sees no OSM light flash before the sync
     * hook lands.
     */
    makeBaseRasterLayer(BASE_OSM_DARK_LAYER_ID, 'carto-dark-matter', 'none'),
    makeBaseRasterLayer(BASE_OSM_LIGHT_LAYER_ID, 'osm-mapnik', 'none'),
    makeBaseRasterLayer(BASE_USGS_IMAGERY_TOPO_LAYER_ID, 'esri-world-imagery', 'none'),
    makeBaseRasterLayer(BASE_USGS_TOPO_LAYER_ID, 'esri-world-topo', 'none'),
    makeBaseRasterLayer(BASE_TACTICAL_LAYER_ID, 'maptiler-dataviz-dark', 'none'),
    makeBaseRasterLayer(BASE_BACKDROP_LAYER_ID, 'maptiler-backdrop-dark', 'none'),
    makeBaseRasterLayer(BASE_SATELLITE_LAYER_ID, 'maptiler-satellite', 'none'),
    {
      // Presentation base. Inlined instead of going through the
      // `makeBaseRasterLayer` factory because it carries a tone-down
      // raster paint: the Carto Positron no-labels tile is near-white
      // out of the box, which reads as harsh on a pitched view next
      // to the warm sky gradient. Capping `raster-brightness-max` at
      // 0.90 knocks the brightest pixels down to a soft cream while
      // leaving the existing greyscale ramp intact; a small negative
      // contrast softens the line edges without flattening the chart.
      id: BASE_PRESENTATION_LAYER_ID,
      type: 'raster',
      source: 'carto-positron-nolabels',
      layout: { visibility: 'visible' },
      paint: {
        // DARK base, LIGHT overlays — the decoupled aesthetic: drop
        // basemap brightness to 0.65 so land reads as dim chart, and
        // push saturation positive (+0.18) so any small patch of
        // water in the source tile that our overlay does not cover
        // still reads as blue rather than grey. The water / green /
        // building overlays sit ON the dark base as light pastels
        // for visible contrast.
        'raster-brightness-max': 0.65,
        'raster-contrast': -0.02,
        'raster-saturation': 0.18,
      },
    },
    {
      // Green-space overlay. Sage-toned fill that picks parks /
      // forests / gardens out of the desaturated Positron base. The
      // data-driven `fill-color` differentiates dense tree cover
      // (darker), urban parks (lighter) and the everything-else
      // bucket (neutral) so the chart reads as an actual map rather
      // than a flat wash. Painted below the water layer so any
      // riverside park that overlaps a riverbank polygon resolves to
      // water on top (consistent with how the real shoreline looks).
      id: PORT_GREEN_LAYER_ID,
      type: 'fill',
      source: PORT_GREEN_SOURCE_ID,
      layout: { visibility: 'visible' },
      paint: {
        // Light pastel sage ON the dark base — washed-out tones that
        // contrast cleanly with the dimmed land. Forest is the
        // darkest of the three to preserve tree-cover signal, park
        // the lightest for urban green; neutral sage sits in between
        // for allotments / meadow / cemetery / recreation.
        'fill-color': [
          'match',
          ['get', 'k'],
          'forest',
          '#c5dcb8',
          'park',
          '#d8e6c6',
          'green',
          '#cedcc2',
          '#cedcc2',
        ],
        'fill-opacity': 0.78,
        'fill-antialias': true,
      },
    },
    {
      // Water overlay paint. Mid nautical blue over the toned-down
      // Positron base, picking out the Odra channel and harbour basins
      // so water reads as water at a glance. `fill-antialias` keeps
      // the edge crisp on the pitched view; the companion line layer
      // below paints a darker outline for shore definition.
      id: PORT_WATER_LAYER_ID,
      type: 'fill',
      source: PORT_WATER_SOURCE_ID,
      layout: { visibility: 'visible' },
      paint: {
        // Pale teal-cyan — sits in a different hue family from the
        // cobalt trail (`#2563eb`) so the two don't compete or read
        // as "same blue". The teal lean adds a fresh chart feel
        // while staying low-saturation enough to feel washed out
        // against the dim base.
        'fill-color': '#c4dde0',
        'fill-opacity': 0.85,
        'fill-antialias': true,
      },
    },
    {
      // Water shoreline. Same source as the fill, drawn as line so
      // the polygon outline reads as a soft coastal contour separate
      // from the fill alpha. Visibility tracks the fill via the
      // overlay registry (both ids land in the Presentation overlay
      // list). A `line` layer over a polygon source renders each
      // ring as a closed stroke.
      id: PORT_WATER_OUTLINE_LAYER_ID,
      type: 'line',
      source: PORT_WATER_SOURCE_ID,
      layout: { visibility: 'visible' },
      paint: {
        'line-color': '#5e85a0',
        'line-width': 1.2,
        'line-opacity': 0.7,
      },
    },
    {
      // MINOR grid lines (every 0.01° ≈ 700 m). Fine cross-hatch for
      // local orientation; amber dashed, low alpha.
      id: PRESENTATION_GRID_LAYER_ID,
      type: 'line',
      source: PRESENTATION_GRID_SOURCE_ID,
      filter: ['==', ['get', 'tier'], 'minor'],
      // Initial visibility is `none` because grid is now a global
      // overlay gated by `$gridVisible` (default off). The sync hook
      // flips it visible when the operator clicks the grid toggle.
      layout: { visibility: 'none' },
      paint: {
        'line-color': 'rgba(251, 146, 60, 0.55)',
        'line-width': 0.9,
        'line-dasharray': [6, 6],
      },
    },
    {
      // MAJOR grid lines (every 0.05° ≈ 3.5 km). Bold solid amber,
      // higher alpha — primary spatial-reference anchor. Sits on top
      // of the minor cross-hatch in the same source via tier filter.
      id: PRESENTATION_GRID_MAJOR_LAYER_ID,
      type: 'line',
      source: PRESENTATION_GRID_SOURCE_ID,
      filter: ['==', ['get', 'tier'], 'major'],
      layout: { visibility: 'none' },
      paint: {
        'line-color': 'rgba(251, 146, 60, 0.9)',
        'line-width': 1.6,
      },
    },
    {
      // Building drop-shadow. A flat fill in the same footprint as the
      // 3D building, translated 4-5 px south-east via `fill-translate`
      // to simulate a sun angle. Drawn BEFORE the fill-extrusion so it
      // sits underneath the rendered building mass on the map. Low
      // alpha keeps the shadow subtle — operator reads it as "there's
      // something dimensional here" without it shouting.
      id: PORT_BUILDINGS_SHADOW_LAYER_ID,
      type: 'fill',
      source: PORT_BUILDINGS_SOURCE_ID,
      paint: {
        'fill-color': 'rgba(20, 24, 36, 0.28)',
        'fill-translate': [5, 5],
        'fill-translate-anchor': 'viewport',
        'fill-antialias': true,
      },
    },
    {
      id: PORT_BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: PORT_BUILDINGS_SOURCE_ID,
      paint: {
        // Lighter pastel peach, same warm palette as before but lifted
        // a few luminance points so the buildings read as architectural
        // mass without going terracotta. Vertical face shading stays
        // on (MapLibre default) — gives lit / shadow sides automatically
        // based on the camera bearing for a soft 3D feel.
        'fill-extrusion-color': '#eebf91',
        'fill-extrusion-height': ['get', 'h'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    /**
     * Seamark overlay. Drawn at reduced opacity and gated above zoom
     * 9 so the marker density at country / region zoom does not
     * dominate the map; at port zoom (z >= 13) the channel markers,
     * lights and anchorage symbols read as context for the AIS
     * vessels rendered on top.
     */
    {
      id: SEAMARK_OVERLAY_LAYER_ID,
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
        // Unified cobalt-blue trail across every vessel — matches
        // the Airspace-style reference where a single blue line
        // signals "vessel track" at-a-glance regardless of category.
        // The vessel MARKER still carries the AIS category colour
        // (cargo blue, tanker teal, passenger green, fishing indigo)
        // so vessel-kind information is preserved at the head of
        // each track, just not duplicated along its length.
        'line-color': '#2563eb',
        // Thicker + zoom-aware: at port zoom (z=14-17) the trail is
        // ~3-4 px so it reads cleanly on the desaturated Presentation
        // basemap and against the pitched 3D view. Stays slim at low
        // zoom to avoid clutter when the whole estuary is visible.
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.8, 14, 3.2, 18, 4.5],
        // Bumped baseline opacity; the selected trail still pops at
        // 0.95. The jagged "stair-step" look on a faint trail goes
        // away once the line is opaque enough to anti-alias cleanly.
        'line-opacity': ['case', isSelected, 0.95, 0.7],
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
        'circle-opacity': opacityCombined,
        'circle-stroke-opacity': opacityCombined,
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
        'icon-opacity': opacityCombined,
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
        'text-opacity': opacityCombined,
        'icon-opacity': opacityCombined,
      },
    },
  ],
};
