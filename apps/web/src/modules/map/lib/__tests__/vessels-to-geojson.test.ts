import { describe, expect, it } from 'vitest';
import {
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_STATIC_FRAME_KIND,
  type VesselStaticDataFrame,
} from '@sps/shared';
import type { LiveVessel } from '../../../telemetry/types';
import { vesselsToGeoJSON } from '../vessels-to-geojson';

function staticFrame(over: Partial<VesselStaticDataFrame> = {}): VesselStaticDataFrame {
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: 261_345_678,
    vesselName: 'TEST',
    callSign: '',
    shipType: 70,
    dimensions: null,
    imo: null,
    draught: null,
    destination: '',
    eta: { month: null, day: null, hour: null, minute: null },
    receivedAt: 1_715_000_000_000,
    ...over,
  };
}

function vessel(over: Partial<LiveVessel> = {}): LiveVessel {
  return {
    mmsi: 261_345_678,
    messageType: 1,
    navStatus: 0,
    sourceId: SourceId.AisStream,
    rateOfTurn: null,
    lng: 14.5528,
    lat: 53.4285,
    sog: 5,
    cog: 90,
    trueHeading: 91,
    timestampUnix: 1_715_000_000,
    flags: VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_HAS_IDENTITY,
    ...over,
  };
}

describe('vesselsToGeoJSON', () => {
  it('emits a FeatureCollection with one Point Feature per fixed vessel', () => {
    const collection = vesselsToGeoJSON({ [261_345_678]: vessel() });
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(1);
    const f = collection.features[0] as {
      type: string;
      id: number;
      geometry: { type: string; coordinates: [number, number] };
      properties: { mmsi: number; isMoving: boolean };
    };
    expect(f.type).toBe('Feature');
    expect(f.id).toBe(261_345_678);
    expect(f.geometry.coordinates).toEqual([14.5528, 53.4285]);
    expect(f.properties.mmsi).toBe(261_345_678);
  });

  it('drops vessels without HAS_FIX even if lng/lat are set', () => {
    const collection = vesselsToGeoJSON({
      [261_111_111]: vessel({ flags: VESSEL_FLAG_HAS_IDENTITY }),
    });
    expect(collection.features).toHaveLength(0);
  });

  it('drops vessels with null lng or null lat regardless of flags', () => {
    const collection = vesselsToGeoJSON({
      [261_222_222]: vessel({ lng: null }),
      [261_333_333]: vessel({ lat: null }),
    });
    expect(collection.features).toHaveLength(0);
  });

  it('marks isMoving=true when IS_MOVING bit is set', () => {
    const collection = vesselsToGeoJSON({
      [261_111_111]: vessel({
        mmsi: 261_111_111,
        flags: VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_IS_MOVING,
      }),
      [261_222_222]: vessel({ mmsi: 261_222_222, flags: VESSEL_FLAG_HAS_FIX }),
    });
    const a = collection.features.find(f => (f as { id: number }).id === 261_111_111) as {
      properties: { isMoving: boolean };
    };
    const b = collection.features.find(f => (f as { id: number }).id === 261_222_222) as {
      properties: { isMoving: boolean };
    };
    expect(a.properties.isMoving).toBe(true);
    expect(b.properties.isMoving).toBe(false);
  });

  it('returns an empty FeatureCollection when the store is empty', () => {
    const collection = vesselsToGeoJSON({});
    expect(collection.features).toHaveLength(0);
  });

  it('exposes hasHeading=true when trueHeading is set', () => {
    const collection = vesselsToGeoJSON({
      [261_345_678]: vessel({ trueHeading: 215 }),
    });
    const f = collection.features[0] as { properties: { heading: number; hasHeading: boolean } };
    expect(f.properties.hasHeading).toBe(true);
    expect(f.properties.heading).toBe(215);
  });

  it('falls back to cog when trueHeading is null', () => {
    const collection = vesselsToGeoJSON({
      [261_345_678]: vessel({ trueHeading: null, cog: 90 }),
    });
    const f = collection.features[0] as { properties: { heading: number; hasHeading: boolean } };
    expect(f.properties.hasHeading).toBe(true);
    expect(f.properties.heading).toBe(90);
  });

  it('marks hasHeading=false when both trueHeading and cog are null', () => {
    const collection = vesselsToGeoJSON({
      [261_345_678]: vessel({ trueHeading: null, cog: null }),
    });
    const f = collection.features[0] as { properties: { heading: number; hasHeading: boolean } };
    expect(f.properties.hasHeading).toBe(false);
    expect(f.properties.heading).toBe(0);
  });

  it('emits category=other when no static data is available for the mmsi', () => {
    const collection = vesselsToGeoJSON({ [261_345_678]: vessel() });
    const f = collection.features[0] as { properties: { category: string } };
    expect(f.properties.category).toBe('other');
  });

  it('classifies a vessel by ship type when matching static data is provided', () => {
    const collection = vesselsToGeoJSON(
      { [261_345_678]: vessel() },
      { [261_345_678]: staticFrame({ shipType: 80 }) },
    );
    const f = collection.features[0] as { properties: { category: string } };
    expect(f.properties.category).toBe('tanker');
  });

  it('falls back to other when the static record carries the AIS-default ship type 0', () => {
    const collection = vesselsToGeoJSON(
      { [261_345_678]: vessel() },
      { [261_345_678]: staticFrame({ shipType: 0 }) },
    );
    const f = collection.features[0] as { properties: { category: string } };
    expect(f.properties.category).toBe('other');
  });

  it('emits the vessel name on the feature when static data carries one', () => {
    const collection = vesselsToGeoJSON(
      { [261_345_678]: vessel() },
      { [261_345_678]: staticFrame({ vesselName: 'TRIESTE' }) },
    );
    const f = collection.features[0] as { properties: { name?: string } };
    expect(f.properties.name).toBe('TRIESTE');
  });

  it('omits the name property when the static name is empty / whitespace', () => {
    const collection = vesselsToGeoJSON(
      { [261_345_678]: vessel() },
      { [261_345_678]: staticFrame({ vesselName: '   ' }) },
    );
    const f = collection.features[0] as { properties: Record<string, unknown> };
    expect('name' in f.properties).toBe(false);
  });
});
