import { VESSEL_FLAG_HAS_FIX, VESSEL_FLAG_IS_MOVING } from '@sps/shared';
import type { LiveVessel } from '../../telemetry/types';
import type { GeoJSONFeatureCollection } from '../core/map-engine.types';
import { pruneTrackerState, smoothedDisplayPosition } from './dead-reckoning-tracker';

type VesselFeatureProperties = {
  readonly mmsi: number;
  readonly heading: number;
  readonly hasHeading: boolean;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly isMoving: boolean;
  readonly ageSeconds: number;
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

export function vesselsToGeoJSON(
  vessels: Readonly<Record<number, LiveVessel>>,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): GeoJSONFeatureCollection {
  const features: VesselFeature[] = [];
  const activeMmsis = new Set<number>();
  for (const mmsi in vessels) {
    const vessel = vessels[mmsi];
    if (vessel === undefined) continue;
    const hasFix = (vessel.flags & VESSEL_FLAG_HAS_FIX) !== 0;
    if (!hasFix) continue;
    const position = smoothedDisplayPosition(vessel, nowSeconds);
    if (position === null) continue;
    activeMmsis.add(vessel.mmsi);
    const isMoving = (vessel.flags & VESSEL_FLAG_IS_MOVING) !== 0;
    const headingValue = vessel.trueHeading ?? vessel.cog;
    const hasHeading = headingValue !== null;
    features.push({
      type: 'Feature',
      id: vessel.mmsi,
      geometry: {
        type: 'Point',
        coordinates: [position.lng, position.lat],
      },
      properties: {
        mmsi: vessel.mmsi,
        heading: headingValue ?? 0,
        hasHeading,
        sog: vessel.sog,
        cog: vessel.cog,
        isMoving,
        ageSeconds: Math.max(0, nowSeconds - vessel.timestampUnix),
      },
    });
  }
  pruneTrackerState(activeMmsis);
  return { type: 'FeatureCollection', features };
}
