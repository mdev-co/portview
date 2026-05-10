import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { SHIP_TYPE_CATEGORIES } from '@sps/shared';
import { VESSEL_CATEGORY_PALETTE, VESSEL_PALETTE } from './vessel-palette';

export const VESSEL_SOURCE_ID = 'vessels';
export const VESSEL_LAYER_ID = 'vessels-circles';
export const VESSEL_ARROW_LAYER_ID = 'vessels-arrows';
export const VESSEL_LABEL_LAYER_ID = 'vessels-labels';
export const VESSEL_ARROW_ICON_ID = 'vessel-arrow';

const statusFallbackColor: ExpressionSpecification = [
  'case',
  ['boolean', ['get', 'isMoving'], false],
  VESSEL_PALETTE.underway.hex,
  VESSEL_PALETTE.anchored.hex,
];

const COLORED_CATEGORIES = SHIP_TYPE_CATEGORIES.filter(c => c !== 'other');

const categoryMatchPairs: string[] = COLORED_CATEGORIES.flatMap(c => [
  c,
  VESSEL_CATEGORY_PALETTE[c].hex,
]);

// MapLibre's ExpressionSpecification is a discriminated tuple union that the
// TS compiler cannot narrow from a spread; the runtime shape is correct
// (alternating string keys + values, expression fallback at the tail).
const colorByCategory = [
  'match',
  ['get', 'category'],
  ...categoryMatchPairs,
  statusFallbackColor,
] as unknown as ExpressionSpecification;

const colorBySelectionAndCategory: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  VESSEL_PALETTE.selected.hex,
  colorByCategory,
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
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '\u00a9 OpenStreetMap contributors',
      maxzoom: 19,
    },
    [VESSEL_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
    },
    {
      id: VESSEL_LAYER_ID,
      type: 'circle',
      source: VESSEL_SOURCE_ID,
      filter: ['!', ['get', 'hasHeading']],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['case', ['boolean', ['feature-state', 'selected'], false], 7, 5],
          14,
          ['case', ['boolean', ['feature-state', 'selected'], false], 12, 9],
          18,
          ['case', ['boolean', ['feature-state', 'selected'], false], 18, 14],
        ],
        'circle-color': colorBySelectionAndCategory,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
        'circle-stroke-color': VESSEL_PALETTE.stroke.hex,
        'circle-opacity': opacityByAge,
      },
    },
    {
      id: VESSEL_ARROW_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      filter: ['get', 'hasHeading'],
      layout: {
        'icon-image': VESSEL_ARROW_ICON_ID,
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
        'icon-rotate': ['get', 'heading'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 1.1, 14, 1.7, 18, 2.4],
      },
      paint: {
        'icon-color': colorBySelectionAndCategory,
        'icon-halo-color': VESSEL_PALETTE.stroke.hex,
        'icon-halo-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 1.6],
        'icon-opacity': opacityByAge,
      },
    },
    {
      id: VESSEL_LABEL_LAYER_ID,
      type: 'symbol',
      source: VESSEL_SOURCE_ID,
      filter: ['has', 'name'],
      minzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13, 18, 14],
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
        'text-padding': 4,
        'text-max-width': 8,
      },
      paint: {
        'text-color': VESSEL_PALETTE.stroke.hex,
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.6,
        'text-opacity': opacityByAge,
      },
    },
  ],
};
