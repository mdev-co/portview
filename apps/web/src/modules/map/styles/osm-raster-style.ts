import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { VESSEL_PALETTE } from './vessel-palette';

export const VESSEL_SOURCE_ID = 'vessels';
export const VESSEL_LAYER_ID = 'vessels-circles';
export const VESSEL_ARROW_LAYER_ID = 'vessels-arrows';
export const VESSEL_ARROW_ICON_ID = 'vessel-arrow';

const colorBySelectionAndStatus: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'selected'], false],
  VESSEL_PALETTE.selected.hex,
  ['boolean', ['get', 'isMoving'], false],
  VESSEL_PALETTE.underway.hex,
  VESSEL_PALETTE.anchored.hex,
];

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
  0.5,
  600,
  0.3,
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
        'circle-color': colorBySelectionAndStatus,
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
        'icon-color': colorBySelectionAndStatus,
        'icon-halo-color': VESSEL_PALETTE.stroke.hex,
        'icon-halo-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 1.6],
        'icon-opacity': opacityByAge,
      },
    },
  ],
};
