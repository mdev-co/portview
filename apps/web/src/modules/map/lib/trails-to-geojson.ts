import {
  type ShipTypeCategory,
  type VesselHistoryPoint,
  type VesselStaticDataFrame,
  shipTypeCategory,
} from '@sps/shared';
import type { GeoJSONFeatureCollection } from '../core/map-engine.types';

type TrailFeatureProperties = {
  readonly mmsi: number;
  readonly category: ShipTypeCategory;
  readonly selected: boolean;
  readonly isMoving: boolean;
};

type TrailFeature = {
  readonly type: 'Feature';
  readonly geometry: {
    readonly type: 'LineString';
    readonly coordinates: ReadonlyArray<readonly [number, number]>;
  };
  readonly properties: TrailFeatureProperties;
};

const FALLBACK_CATEGORY: ShipTypeCategory = 'other';
const MIN_TRAIL_POINTS = 2;

/**
 * Build a FeatureCollection of LineString features, one per vessel
 * with at least two history points. The polyline paint expression on
 * the trails layer reads `category`, `selected` and `isMoving` from
 * properties so the trail colour matches its marker.
 *
 * Vessels with only one history point (just appeared) are skipped:
 * a single point is not a line and rendering would be a no-op anyway.
 */
export function trailsToGeoJSON(
  history: Readonly<Record<number, readonly VesselHistoryPoint[]>>,
  staticData: Readonly<Record<number, VesselStaticDataFrame>> = {},
  selectedMmsi: number | null = null,
  isVisible: (mmsi: number) => boolean = () => true,
): GeoJSONFeatureCollection {
  const features: TrailFeature[] = [];
  for (const mmsiKey in history) {
    const points = history[mmsiKey];
    if (points === undefined || points.length < MIN_TRAIL_POINTS) continue;
    const mmsi = Number(mmsiKey);
    if (!isVisible(mmsi)) continue;
    const coordinates: ReadonlyArray<readonly [number, number]> = points.map(p => [p.lng, p.lat]);
    const latest = points[points.length - 1];
    const isMoving = latest !== undefined && latest.sog !== null && latest.sog > 0.5;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: {
        mmsi,
        category: categoryFor(staticData, mmsi),
        selected: mmsi === selectedMmsi,
        isMoving,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function categoryFor(
  staticData: Readonly<Record<number, VesselStaticDataFrame>>,
  mmsi: number,
): ShipTypeCategory {
  const entry = staticData[mmsi];
  if (entry === undefined) return FALLBACK_CATEGORY;
  return shipTypeCategory(entry.shipType);
}
