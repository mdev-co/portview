import type { StyleSpecification } from 'maplibre-gl';

export const VESSEL_SOURCE_ID = 'vessels';
export const VESSEL_LAYER_ID = 'vessels-circles';

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
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['case', ['boolean', ['feature-state', 'selected'], false], 5, 3],
          14,
          ['case', ['boolean', ['feature-state', 'selected'], false], 9, 6],
          18,
          ['case', ['boolean', ['feature-state', 'selected'], false], 13, 10],
        ],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#fbbf24',
          ['boolean', ['get', 'isMoving'], false],
          '#34d399',
          '#94a3b8',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          2.5,
          1.5,
        ],
        'circle-stroke-color': '#0f172a',
        'circle-opacity': 0.9,
      },
    },
  ],
};
