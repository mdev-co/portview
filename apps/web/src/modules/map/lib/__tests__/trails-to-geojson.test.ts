import { describe, expect, it } from 'vitest';
import {
  type Mmsi,
  VESSEL_STATIC_FRAME_KIND,
  type VesselHistoryPoint,
  type VesselStaticDataFrame,
} from '@sps/shared';
import { trailsToGeoJSON } from '../trails-to-geojson';

function point(over: Partial<VesselHistoryPoint> = {}): VesselHistoryPoint {
  return {
    lng: 14.55,
    lat: 53.42,
    sog: 5,
    cog: 90,
    trueHeading: 90,
    timestampUnix: 1_715_000_000,
    ...over,
  };
}

function staticFrame(over: Partial<VesselStaticDataFrame> = {}): VesselStaticDataFrame {
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: 100 as Mmsi,
    vesselName: 'TEST',
    callSign: '',
    shipType: 70 as VesselStaticDataFrame['shipType'],
    dimensions: null,
    imo: null,
    draught: null,
    destination: '',
    eta: { month: null, day: null, hour: null, minute: null },
    receivedAt: 1_715_000_000_000,
    ...over,
  };
}

describe('trailsToGeoJSON', () => {
  it('returns empty when history has no points', () => {
    const fc = trailsToGeoJSON({});
    expect(fc.features).toHaveLength(0);
  });

  it('skips vessels with fewer than two history points', () => {
    const fc = trailsToGeoJSON({ 100: [point()] });
    expect(fc.features).toHaveLength(0);
  });

  it('emits one LineString per vessel with two or more points', () => {
    const fc = trailsToGeoJSON({
      100: [point({ lng: 14.5 }), point({ lng: 14.6 }), point({ lng: 14.7 })],
      200: [point({ lng: 15.5 }), point({ lng: 15.6 })],
    });
    expect(fc.features).toHaveLength(2);
    const f = fc.features[0] as {
      geometry: { type: string; coordinates: [number, number][] };
      properties: { mmsi: number };
    };
    expect(f.geometry.type).toBe('LineString');
    expect(f.geometry.coordinates).toHaveLength(3);
  });

  it('reads the category from static data when available', () => {
    const fc = trailsToGeoJSON(
      { 100: [point(), point()] },
      { 100: staticFrame({ shipType: 80 as VesselStaticDataFrame['shipType'] }) },
    );
    const f = fc.features[0] as { properties: { category: string } };
    expect(f.properties.category).toBe('tanker');
  });

  it('marks selected=true only on the matching mmsi feature', () => {
    const fc = trailsToGeoJSON(
      {
        100: [point(), point()],
        200: [point(), point()],
      },
      {},
      200,
    );
    const a = fc.features.find(
      f => (f as { properties: { mmsi: number } }).properties.mmsi === 100,
    ) as { properties: { selected: boolean } };
    const b = fc.features.find(
      f => (f as { properties: { mmsi: number } }).properties.mmsi === 200,
    ) as { properties: { selected: boolean } };
    expect(a.properties.selected).toBe(false);
    expect(b.properties.selected).toBe(true);
  });
});
