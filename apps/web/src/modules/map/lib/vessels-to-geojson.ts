import { VESSEL_FLAG_HAS_FIX, VESSEL_FLAG_IS_MOVING } from '@sps/shared';
import type { LiveVessel } from '../../telemetry/types';
import type { GeoJSONFeatureCollection } from '../core/map-engine.types';

type VesselFeatureProperties = {
  readonly mmsi: number;
  readonly heading: number | null;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly isMoving: boolean;
};

type VesselFeature = {
  readonly type: 'Feature';
  readonly id: number;
  readonly geometry: {
    readonly type: 'Point';
    readonly coordinates: readonly [number, number];
  };
  readonly properties: VesselFeatureProperties;
};

/**
 * Convert the live vessel store snapshot into a GeoJSON FeatureCollection
 * suitable for `IMapEngineAdapter.setSourceData('vessels', ...)`. Vessels
 * without a HAS_FIX flag (or null lng/lat) are dropped - they have no
 * position to render.
 */
export function vesselsToGeoJSON(
  vessels: Readonly<Record<number, LiveVessel>>,
): GeoJSONFeatureCollection {
  const features: VesselFeature[] = [];
  for (const mmsi in vessels) {
    const vessel = vessels[mmsi];
    if (vessel === undefined) continue;
    const hasFix = (vessel.flags & VESSEL_FLAG_HAS_FIX) !== 0;
    if (!hasFix) continue;
    if (vessel.lng === null || vessel.lat === null) continue;
    const isMoving = (vessel.flags & VESSEL_FLAG_IS_MOVING) !== 0;
    features.push({
      type: 'Feature',
      id: vessel.mmsi,
      geometry: {
        type: 'Point',
        coordinates: [vessel.lng, vessel.lat],
      },
      properties: {
        mmsi: vessel.mmsi,
        heading: vessel.trueHeading,
        sog: vessel.sog,
        cog: vessel.cog,
        isMoving,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
