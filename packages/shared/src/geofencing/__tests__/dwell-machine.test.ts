import { describe, expect, it } from 'vitest';
import type { Mmsi } from '../../types/brands';
import {
  DEFAULT_DWELL_CONFIG,
  type GeofenceEvent,
  type MembershipState,
  type VesselPositionFrame,
  type Zone,
  computePresence,
  forceExitVessel,
  membershipKey,
  sweepGhosts,
  tickGeofence,
  zoneId,
} from '../index';

const VESSEL: Mmsi = 261_000_001 as Mmsi;
const OTHER_VESSEL: Mmsi = 261_000_002 as Mmsi;
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
const ZONE_B: Zone = {
  type: 'Feature',
  properties: { id: zoneId('zone-b'), label: 'Zone B', kind: 'channel' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [14.7, 53.4],
        [14.8, 53.4],
        [14.8, 53.5],
        [14.7, 53.5],
        [14.7, 53.4],
      ],
    ],
  },
};

function frame(
  opts: Partial<VesselPositionFrame> & { lng: number; lat: number; t: number },
): VesselPositionFrame {
  return {
    mmsi: opts.mmsi ?? VESSEL,
    lng: opts.lng,
    lat: opts.lat,
    timestampUnix: opts.t,
  };
}

const INSIDE_A = { lng: 14.55, lat: 53.45 };
const OUTSIDE = { lng: 13.0, lat: 53.45 };
// 0.0003 deg lng at lat 53.45 is roughly 12 m on either side of the
// boundary - a realistic AIS GPS noise band for an urban-port RF
// environment (10-50 m). Picked deliberately so the flicker test
// reflects field conditions, not an artificial tight band.
const NEAR_BOUNDARY_OUTSIDE = { lng: 14.4997, lat: 53.45 };
const NEAR_BOUNDARY_INSIDE = { lng: 14.5003, lat: 53.45 };

describe('tickGeofence - basic dwell hysteresis', () => {
  it('emits no event for the very first INSIDE frame (dwell window has not elapsed)', () => {
    const start: MembershipState = new Map();
    const result = tickGeofence(start, frame({ ...INSIDE_A, t: 1_000 }), [ZONE_A], 1_000);
    expect(result.events).toEqual([]);
    expect(result.state.size).toBe(1);
    const entry = result.state.get(membershipKey(VESSEL, zoneId('zone-a')));
    expect(entry?.insideSince).toBe(1_000);
    expect(entry?.confirmed).toBe(false);
  });

  it('emits ENTER exactly when the inside dwell threshold elapses (30 s default)', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A], 0).state;
    const second = tickGeofence(state, frame({ ...INSIDE_A, t: 29_999 }), [ZONE_A], 29_999);
    expect(second.events).toEqual([]);
    expect(second.state.get(membershipKey(VESSEL, zoneId('zone-a')))?.confirmed).toBe(false);

    const third = tickGeofence(second.state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A], 30_000);
    expect(third.events).toEqual([
      { kind: 'enter', mmsi: VESSEL, zoneId: zoneId('zone-a'), at: 30_000 },
    ]);
    expect(third.state.get(membershipKey(VESSEL, zoneId('zone-a')))?.confirmed).toBe(true);
  });

  it('emits EXIT when the outside dwell threshold elapses after a confirmed Enter', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A], 0).state;
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A], 30_000).state;
    state = tickGeofence(state, frame({ ...OUTSIDE, t: 35_000 }), [ZONE_A], 35_000).state;
    const result = tickGeofence(state, frame({ ...OUTSIDE, t: 65_000 }), [ZONE_A], 65_000);
    expect(result.events).toEqual([
      { kind: 'exit', mmsi: VESSEL, zoneId: zoneId('zone-a'), at: 65_000 },
    ]);
  });

  it('removes the membership key entirely after a confirmed EXIT (memory bound)', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A], 0).state;
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A], 30_000).state;
    state = tickGeofence(state, frame({ ...OUTSIDE, t: 35_000 }), [ZONE_A], 35_000).state;
    const result = tickGeofence(state, frame({ ...OUTSIDE, t: 65_000 }), [ZONE_A], 65_000);
    expect(result.state.has(membershipKey(VESSEL, zoneId('zone-a')))).toBe(false);
  });
});

describe('tickGeofence - boundary flicker (the critical scenario)', () => {
  it('does NOT emit Enter when a vessel oscillates across the boundary faster than the dwell window', () => {
    // Vessel pings every second: inside, outside, inside, outside, ...
    // for 60 seconds. Without hysteresis this would emit 30 Enters and
    // 30 Exits. With the dwell window it must emit zero events.
    let state: MembershipState = new Map();
    const events = [];
    for (let t = 0; t <= 60_000; t += 1_000) {
      const pos = t % 2_000 === 0 ? NEAR_BOUNDARY_INSIDE : NEAR_BOUNDARY_OUTSIDE;
      const result = tickGeofence(state, frame({ ...pos, t }), [ZONE_A], t);
      state = result.state;
      events.push(...result.events);
    }
    expect(events).toEqual([]);
  });

  it('emits exactly one Enter when oscillation stops with a sustained inside run', () => {
    let state: MembershipState = new Map();
    const events = [];
    // 30 s of oscillation
    for (let t = 0; t < 30_000; t += 1_000) {
      const pos = t % 2_000 === 0 ? NEAR_BOUNDARY_INSIDE : NEAR_BOUNDARY_OUTSIDE;
      const result = tickGeofence(state, frame({ ...pos, t }), [ZONE_A], t);
      state = result.state;
      events.push(...result.events);
    }
    // Then 60 s sustained inside
    for (let t = 30_000; t <= 90_000; t += 1_000) {
      const result = tickGeofence(state, frame({ ...INSIDE_A, t }), [ZONE_A], t);
      state = result.state;
      events.push(...result.events);
    }
    expect(events.filter(e => e.kind === 'enter').length).toBe(1);
    expect(events[0]?.at).toBe(60_000);
  });
});

describe('tickGeofence - multiple zones', () => {
  it('tracks membership independently across zones', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A, ZONE_B], 0).state;
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A, ZONE_B], 30_000).state;
    expect(state.has(membershipKey(VESSEL, zoneId('zone-a')))).toBe(true);
    // ZONE_B never engaged (vessel never went inside B), no entry allocated.
    expect(state.has(membershipKey(VESSEL, zoneId('zone-b')))).toBe(false);
  });

  it('does not allocate a key when the vessel has never been inside the zone (memory bound on first-tick miss)', () => {
    const result = tickGeofence(new Map(), frame({ ...OUTSIDE, t: 0 }), [ZONE_A, ZONE_B], 0);
    expect(result.state.size).toBe(0);
    expect(result.events).toEqual([]);
  });
});

describe('tickGeofence - time as data, not Date.now', () => {
  it('produces deterministic events from a replayed frame sequence regardless of wall-clock', () => {
    // Replay the same 3-frame sequence twice with very different
    // wall-clock moments by reading "now" from the frame timestamps.
    // The dwell machine must emit identical events because time is
    // taken from data, not from the host clock.
    const frames = [
      frame({ ...INSIDE_A, t: 0 }),
      frame({ ...INSIDE_A, t: 30_000 }),
      frame({ ...OUTSIDE, t: 65_000 }),
    ];

    function replay(): readonly GeofenceEvent[] {
      let s: MembershipState = new Map();
      const events: GeofenceEvent[] = [];
      for (const f of frames) {
        const r = tickGeofence(s, f, [ZONE_A], f.timestampUnix);
        s = r.state;
        events.push(...r.events);
      }
      return events;
    }

    const first = replay();
    const second = replay();
    // Compare the FULL event objects (mmsi + zoneId + at + kind),
    // not just a projection - the ADR claim is that the events are
    // bit-identical across replays. Anything less leaks a possible
    // mmsi / zone drift through the equality.
    expect(first).toEqual(second);
    expect(first).toEqual([{ kind: 'enter', mmsi: VESSEL, zoneId: zoneId('zone-a'), at: 30_000 }]);
  });
});

describe('sweepGhosts', () => {
  it('emits ghost-exit for a confirmed-inside vessel that goes silent past the timeout', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A], 0).state;
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A], 30_000).state;
    // Vessel goes silent. Sweep 10 minutes + 1 ms later.
    const sweep = sweepGhosts(state, 30_000 + DEFAULT_DWELL_CONFIG.ghostTimeoutMs + 1);
    expect(sweep.events.length).toBe(1);
    expect(sweep.events[0]?.kind).toBe('ghost-exit');
    expect(sweep.state.size).toBe(0);
  });

  it('drops a never-confirmed entry silently (no event) past the timeout', () => {
    // Vessel passed near the boundary once, then disappeared - never
    // crossed the dwell threshold. Sweep must drop it without
    // emitting anything (no operator-visible state changed).
    const state: MembershipState = new Map([
      [
        membershipKey(VESSEL, zoneId('zone-a')),
        { insideSince: 0, outsideSince: null, confirmed: false, lastSeenAt: 0 },
      ],
    ]);
    const sweep = sweepGhosts(state, DEFAULT_DWELL_CONFIG.ghostTimeoutMs + 1);
    expect(sweep.events).toEqual([]);
    expect(sweep.state.size).toBe(0);
  });

  it('keeps entries that are within the ghost window', () => {
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 1_000 }), [ZONE_A], 1_000).state;
    const sweep = sweepGhosts(state, 1_000 + DEFAULT_DWELL_CONFIG.ghostTimeoutMs - 1);
    expect(sweep.events).toEqual([]);
    expect(sweep.state.size).toBe(1);
  });
});

describe('forceExitVessel', () => {
  it('emits Exit for every confirmed zone of a vessel and removes all of its keys', () => {
    // Establish confirmed presence in two zones.
    let state: MembershipState = new Map();
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 0 }), [ZONE_A], 0).state;
    state = tickGeofence(state, frame({ ...INSIDE_A, t: 30_000 }), [ZONE_A], 30_000).state;
    // Also fake-confirm vessel in ZONE_B (operator merged zones, etc.)
    state = new Map(state).set(membershipKey(VESSEL, zoneId('zone-b')), {
      insideSince: 0,
      outsideSince: null,
      confirmed: true,
      lastSeenAt: 30_000,
    });

    const result = forceExitVessel(state, VESSEL, 100_000);
    expect(result.events.length).toBe(2);
    expect(result.events.every(e => e.kind === 'exit')).toBe(true);
    expect(result.events.every(e => e.mmsi === VESSEL)).toBe(true);
    expect(result.state.size).toBe(0);
  });

  it('does not touch other vessels and never emits for unconfirmed entries', () => {
    const state: MembershipState = new Map([
      [
        membershipKey(VESSEL, zoneId('zone-a')),
        { insideSince: 0, outsideSince: null, confirmed: false, lastSeenAt: 5_000 },
      ],
      [
        membershipKey(OTHER_VESSEL, zoneId('zone-a')),
        { insideSince: 0, outsideSince: null, confirmed: true, lastSeenAt: 5_000 },
      ],
    ]);
    const result = forceExitVessel(state, VESSEL, 10_000);
    expect(result.events).toEqual([]);
    // OTHER_VESSEL entry preserved.
    expect(result.state.has(membershipKey(OTHER_VESSEL, zoneId('zone-a')))).toBe(true);
    // VESSEL entry deleted regardless of confirmed status.
    expect(result.state.has(membershipKey(VESSEL, zoneId('zone-a')))).toBe(false);
  });
});

describe('computePresence', () => {
  it('projects only confirmed entries into the presence map', () => {
    const state: MembershipState = new Map([
      [
        membershipKey(VESSEL, zoneId('zone-a')),
        { insideSince: 0, outsideSince: null, confirmed: true, lastSeenAt: 5_000 },
      ],
      [
        membershipKey(VESSEL, zoneId('zone-b')),
        { insideSince: 0, outsideSince: null, confirmed: false, lastSeenAt: 5_000 },
      ],
    ]);
    const presence = computePresence(state);
    expect(presence.get(VESSEL)?.has(zoneId('zone-a'))).toBe(true);
    expect(presence.get(VESSEL)?.has(zoneId('zone-b'))).toBe(false);
  });
});

describe('memory bound under churn', () => {
  it('stays bounded over 1000 transient-vessel ticks with mixed inside/outside', () => {
    let state: MembershipState = new Map();
    for (let i = 0; i < 1000; i++) {
      const mmsi = (261_000_000 + i) as Mmsi;
      // Each transient vessel: 1 frame inside, then disappears.
      const r1 = tickGeofence(
        state,
        frame({ ...INSIDE_A, t: i * 1_000, mmsi }),
        [ZONE_A],
        i * 1_000,
      );
      state = r1.state;
    }
    // None of these vessels stayed long enough to confirm, and none
    // ever produced an outside frame to trigger the cleanup path.
    // Sweeping past the ghost window must drop everything silently.
    const sweep = sweepGhosts(state, 1000 * 1_000 + DEFAULT_DWELL_CONFIG.ghostTimeoutMs + 1);
    expect(sweep.events).toEqual([]);
    expect(sweep.state.size).toBe(0);
  });
});
