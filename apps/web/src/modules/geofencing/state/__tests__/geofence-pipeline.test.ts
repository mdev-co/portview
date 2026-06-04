import type { LiveVessel } from '@/modules/telemetry/types';
import { $vessels } from '@/modules/telemetry/vessels.store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Mmsi, type Zone, type ZoneCollection, zoneId } from '@sps/shared';
import {
  $geofenceEvents,
  $geofenceMembership,
  $geofencePresence,
  InvalidZoneIdError,
  __pipelineTest,
  clearGeofenceEvents,
  setGeofenceZones,
  setMembershipState,
  startGeofencePipeline,
  stopGeofencePipeline,
} from '../index';

const ZONE_A: Zone = {
  type: 'Feature',
  properties: { id: zoneId('zone-a'), label: 'Zone A', kind: 'anchorage' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [14.5, 53.4],
        [14.6, 53.4],
        [14.6, 53.5],
        [14.5, 53.5],
        [14.5, 53.4],
      ],
    ],
  },
};

const TEST_COLLECTION: ZoneCollection = {
  type: 'FeatureCollection',
  features: [ZONE_A],
};

function vessel(opts: { mmsi: number; lng: number; lat: number; tSec: number }): LiveVessel {
  return {
    mmsi: opts.mmsi as Mmsi,
    messageType: 1,
    navStatus: 0,
    sourceId: 3 as LiveVessel['sourceId'],
    rateOfTurn: null,
    lng: opts.lng,
    lat: opts.lat,
    sog: 5,
    cog: 90,
    trueHeading: 90,
    timestampUnix: opts.tSec,
    flags: 0,
  };
}

describe('geofence pipeline', () => {
  beforeEach(() => {
    $vessels.set({});
    setMembershipState(new Map());
    clearGeofenceEvents();
    $geofencePresence.set({});
    setGeofenceZones(TEST_COLLECTION);
    __pipelineTest.resetPipelineState();
  });

  afterEach(() => {
    stopGeofencePipeline();
  });

  it('drives tickGeofence when a vessel is added to $vessels', () => {
    startGeofencePipeline();
    // Single ping inside the zone - dwell window not yet elapsed.
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    const events = $geofenceEvents.get();
    expect(events).toEqual([]);
    // Membership state has the tracking entry but unconfirmed.
    const state = $geofenceMembership.get();
    expect(state.size).toBe(1);
  });

  it('emits an ENTER event once the dwell window elapses across two pings', () => {
    startGeofencePipeline();
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    expect($geofenceEvents.get()).toEqual([]);
    // 30 seconds later, still inside.
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31_000 }),
    );
    const events = $geofenceEvents.get();
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe('enter');
    expect(events[0]?.mmsi).toBe(261_001);
  });

  it('synthesises Exit when a confirmed-inside vessel is evicted from $vessels', () => {
    startGeofencePipeline();
    // Establish confirmed presence.
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31_000 }),
    );
    expect($geofenceEvents.get().length).toBe(1);
    // Vessel eviction sweep replaces the whole store without our vessel.
    $vessels.set({});
    const events = $geofenceEvents.get();
    expect(events.length).toBe(2);
    expect(events[1]?.kind).toBe('exit');
    expect(events[1]?.mmsi).toBe(261_001);
    // Membership state cleared for that vessel.
    expect($geofenceMembership.get().size).toBe(0);
  });

  it('is idempotent: a second startGeofencePipeline call does not duplicate listeners', () => {
    startGeofencePipeline();
    startGeofencePipeline();
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31_000 }),
    );
    // Exactly one Enter event, not two.
    expect($geofenceEvents.get().length).toBe(1);
  });

  it('does nothing when the zone collection is empty (start-up race before zones load)', () => {
    setGeofenceZones({ type: 'FeatureCollection', features: [] });
    startGeofencePipeline();
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    expect($geofenceEvents.get()).toEqual([]);
    expect($geofenceMembership.get().size).toBe(0);
  });

  it('writes a per-vessel presence key only when the confirmed-zone set actually changes', () => {
    startGeofencePipeline();
    // Build up to a confirmed Enter for VESSEL.
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    expect($geofencePresence.get()['261001']).toBeUndefined();
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31_000 }),
    );
    // Presence keyed by mmsi-as-string holds the single confirmed zone.
    expect($geofencePresence.get()['261001']).toEqual([zoneId('zone-a')]);
  });

  it('clears the per-vessel presence to [] when the vessel disappears from $vessels', () => {
    startGeofencePipeline();
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1_000 }),
    );
    $vessels.setKey(
      261_001 as Mmsi,
      vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31_000 }),
    );
    expect($geofencePresence.get()['261001']).toEqual([zoneId('zone-a')]);
    $vessels.set({});
    expect($geofencePresence.get()['261001']).toEqual([]);
  });

  it('uses the last seen frame timestamp (not Date.now) for eviction-synthesised Exit events', () => {
    startGeofencePipeline();
    // Establish confirmed presence with a frame at t=31_000 (ms after epoch).
    $vessels.setKey(261_001 as Mmsi, vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 1 }));
    $vessels.setKey(261_001 as Mmsi, vessel({ mmsi: 261_001, lng: 14.55, lat: 53.45, tSec: 31 }));
    // Evict the vessel from $vessels. The pipeline must derive the
    // synthetic Exit's `at` from the last seen membership entry's
    // lastSeenAt (31 sec * 1000 = 31_000 ms), NOT from Date.now().
    $vessels.set({});
    const exitEvent = $geofenceEvents.get().find(e => e.kind === 'exit');
    expect(exitEvent).toBeDefined();
    expect(exitEvent?.at).toBe(31_000);
  });
});

describe('setGeofenceZones validation', () => {
  it('rejects zone ids that contain the | separator used by the membership map', () => {
    expect(() =>
      setGeofenceZones({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: zoneId('zone|with|pipes'), label: 'Bad', kind: 'general' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [14.5, 53.4],
                  [14.6, 53.4],
                  [14.6, 53.5],
                  [14.5, 53.4],
                ],
              ],
            },
          },
        ],
      }),
    ).toThrow(InvalidZoneIdError);
  });
});

describe('$geofenceEvents ring buffer', () => {
  beforeEach(() => {
    clearGeofenceEvents();
  });

  it('caps at RECENT_EVENT_BUFFER_SIZE events, oldest dropped first', async () => {
    const { appendGeofenceEvents, RECENT_EVENT_BUFFER_SIZE } = await import('../index');
    const batch = Array.from({ length: RECENT_EVENT_BUFFER_SIZE + 5 }, (_, i) => ({
      kind: 'enter' as const,
      mmsi: (261_000 + i) as Mmsi,
      zoneId: zoneId('zone-a'),
      at: i,
    }));
    appendGeofenceEvents(batch);
    const stored = $geofenceEvents.get();
    expect(stored.length).toBe(RECENT_EVENT_BUFFER_SIZE);
    expect(stored[0]?.at).toBe(5);
    expect(stored.at(-1)?.at).toBe(RECENT_EVENT_BUFFER_SIZE + 4);
  });
});
