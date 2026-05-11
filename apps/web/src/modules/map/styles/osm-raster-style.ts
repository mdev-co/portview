import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { SHIP_TYPE_CATEGORIES } from '@sps/shared';
import { VESSEL_CATEGORY_PALETTE, VESSEL_PALETTE } from './vessel-palette';

export const VESSEL_SOURCE_ID = 'vessels';
export const VESSEL_LAYER_ID = 'vessels-circles';
export const VESSEL_ARROW_LAYER_ID = 'vessels-arrows';
export const VESSEL_LABEL_LAYER_ID = 'vessels-labels';
export const VESSEL_ARROW_ICON_ID = 'vessel-arrow';
export const VESSEL_TRAIL_SOURCE_ID = 'vessel-trails';
export const VESSEL_TRAIL_LAYER_ID = 'vessels-trails';

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

// Selection keeps the category fill so a Cargo / Tanker / Service vessel
// stays readable at a glance; the amber accent moves to the stroke and
// halo where it reads as a ring around the marker rather than swapping
// the entire shape's colour. Stale fixes shift the stroke to dim slate
// when not selected.
const strokeColorBySelection: ExpressionSpecification = [
  'case',
  isSelected,
  VESSEL_PALETTE.selected.hex,
  isStaleFix,
  STALE_STROKE_HEX,
  VESSEL_PALETTE.stroke.hex,
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
    [VESSEL_TRAIL_SOURCE_ID]: {
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
          ['case', isSelected, 7, 5],
          14,
          ['case', isSelected, 12, 9],
          18,
          ['case', isSelected, 18, 14],
        ],
        'circle-color': fillColorByMovementAndCategory,
        'circle-stroke-width': ['case', isSelected, 3, 2],
        'circle-stroke-color': strokeColorBySelection,
        'circle-opacity': ['case', isSelected, 1, opacityByAge],
        'circle-stroke-opacity': ['case', isSelected, 1, opacityByAge],
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
        'icon-color': fillColorByMovementAndCategory,
        'icon-halo-color': strokeColorBySelection,
        'icon-halo-width': ['case', isSelected, 4, 1.6],
        'icon-opacity': ['case', isSelected, 1, opacityByAge],
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
        // useful than an unlabelled marker.
        'text-field': ['case', ['has', 'name'], ['get', 'name'], ['to-string', ['get', 'mmsi']]],
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
        'text-opacity': ['case', isSelected, 1, opacityByAge],
      },
    },
  ],
};
