import { $vessels, appendHistoryPoint, setVessel, setVesselStatic } from '@/modules/telemetry';
import {
  type Mmsi,
  type ShipTypeCode,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_STATIC_FRAME_KIND,
  type VesselHistoryPoint,
} from '@sps/shared';
import { $demoMode } from './demo-mode.atom';

/**
 * Reserved synthetic MMSIs. The 999_xxx_xxx prefix is well outside the
 * MID allocations the ITU assigns to real flags (every real MMSI starts
 * with a 3-digit MID 200-799), so the demo vessels can never shadow a
 * live AIS broadcast. The pair sits in $vessels alongside real traffic
 * for the duration of the toggle and is removed on toggle-off.
 */
const DEMO_ALPHA_MMSI = 999_000_001 as Mmsi;
const DEMO_BRAVO_MMSI = 999_000_002 as Mmsi;
const DEMO_MMSIS: ReadonlyArray<Mmsi> = [DEMO_ALPHA_MMSI, DEMO_BRAVO_MMSI];

const PORT_CENTER_LNG = 14.572;
const PORT_CENTER_LAT = 53.432;

/**
 * Trail append cadence. Real AIS Class B broadcasts every 30 s when
 * underway; for the demo we settle on 1 s appends so the polyline
 * builds visibly without flooding the bounded history buffer at the
 * rAF cadence of the position updates.
 */
const HISTORY_APPEND_INTERVAL_MS = 1_000;

const METERS_PER_DEG_LAT = 111_000;
const METERS_PER_DEG_LNG_AT_SZC = METERS_PER_DEG_LAT * Math.cos((53.43 * Math.PI) / 180);
const MS_PER_S = 1_000;
const MS_TO_KNOTS = 1.94384;

const PLEASURE_CRAFT_TYPE = 37 as ShipTypeCode;
const PASSENGER_TYPE = 60 as ShipTypeCode;

type DemoOrbit = {
  readonly mmsi: Mmsi;
  readonly name: string;
  readonly callSign: string;
  readonly shipType: ShipTypeCode;
  readonly centerLng: number;
  readonly centerLat: number;
  readonly radiusLng: number;
  readonly radiusLat: number;
  /** Seconds for a full lap. Negative values reverse the orbit direction. */
  readonly periodSeconds: number;
  /** Initial phase in radians so the two vessels start at different points. */
  readonly phase: number;
};

const ORBITS: ReadonlyArray<DemoOrbit> = [
  {
    mmsi: DEMO_ALPHA_MMSI,
    name: 'SPS DEMO ALPHA',
    callSign: 'DEMOA',
    shipType: PASSENGER_TYPE,
    centerLng: PORT_CENTER_LNG + 0.005,
    centerLat: PORT_CENTER_LAT + 0.003,
    radiusLng: 0.013,
    radiusLat: 0.006,
    periodSeconds: 180,
    phase: 0,
  },
  {
    mmsi: DEMO_BRAVO_MMSI,
    name: 'SPS DEMO BRAVO',
    callSign: 'DEMOB',
    shipType: PLEASURE_CRAFT_TYPE,
    centerLng: PORT_CENTER_LNG - 0.003,
    centerLat: PORT_CENTER_LAT - 0.004,
    radiusLng: 0.009,
    radiusLat: 0.004,
    periodSeconds: -120,
    phase: Math.PI,
  },
];

type OrbitSample = {
  readonly lng: number;
  readonly lat: number;
  /** Speed over ground in knots. */
  readonly sog: number;
  /** Course over ground in degrees clockwise from North. */
  readonly cog: number;
};

/**
 * Parametric position + ground-frame velocity for a vessel orbiting the
 * port centre on an ellipse. Solving the velocity analytically (rather
 * than numerically differencing two `sampleOrbit` calls) avoids a
 * floating-point dt artefact on the first tick and gives a stable COG
 * the moment the demo starts.
 */
function sampleOrbit(orbit: DemoOrbit, elapsedSeconds: number): OrbitSample {
  const omega = (2 * Math.PI) / orbit.periodSeconds;
  const theta = orbit.phase + elapsedSeconds * omega;
  const lng = orbit.centerLng + orbit.radiusLng * Math.cos(theta);
  const lat = orbit.centerLat + orbit.radiusLat * Math.sin(theta);
  // Velocity in degrees per second (analytic derivative of position).
  const dLng = -orbit.radiusLng * Math.sin(theta) * omega;
  const dLat = orbit.radiusLat * Math.cos(theta) * omega;
  const vx = dLng * METERS_PER_DEG_LNG_AT_SZC;
  const vy = dLat * METERS_PER_DEG_LAT;
  const speedMetersPerSecond = Math.hypot(vx, vy);
  const sog = speedMetersPerSecond * MS_TO_KNOTS;
  // Bearing from North clockwise, atan2 returns angle from +X
  // counter-clockwise, so swap arguments to get angle from North.
  const cogRadians = Math.atan2(vx, vy);
  const cog = ((cogRadians * 180) / Math.PI + 360) % 360;
  return { lng, lat, sog, cog };
}

// `rafHandle === 0` is the "not running" sentinel. `requestAnimationFrame`
// always returns a positive integer per the W3C spec, so 0 is safely
// out of band. Keeping a single mutable cell instead of an `{ ... }`
// object avoids a per-frame allocation at 60 fps.
let rafHandle = 0;

function startDemo(): void {
  if (rafHandle !== 0) return;
  const startedAtMs = Date.now();

  // Register static frames once so the sidebar shows the name + type
  // immediately. The store keeps these next to the position frames the
  // tick injects below.
  for (const orbit of ORBITS) {
    setVesselStatic({
      kind: VESSEL_STATIC_FRAME_KIND,
      mmsi: orbit.mmsi,
      vesselName: orbit.name,
      imo: null,
      callSign: orbit.callSign,
      shipType: orbit.shipType,
      dimensions: null,
      draught: null,
      destination: 'PORT DEMO LOOP',
      eta: { month: null, day: null, hour: null, minute: null },
      receivedAt: Math.floor(startedAtMs / MS_PER_S),
    });
  }

  // History append throttle. Position updates run at rAF so the marker
  // and the 3D model glide continuously, but the trail polyline only
  // gains a new vertex every HISTORY_APPEND_INTERVAL_MS - a real AIS
  // feed appends at broadcast cadence (typically 2-30 s), and matching
  // that prevents the bounded history buffer from rolling over 60x per
  // second.
  let nextHistoryAppendAtMs = startedAtMs;

  const frame = (): void => {
    const nowMs = Date.now();
    const elapsedSeconds = (nowMs - startedAtMs) / MS_PER_S;
    const timestampUnix = Math.floor(nowMs / MS_PER_S);
    const appendHistoryThisFrame = nowMs >= nextHistoryAppendAtMs;
    if (appendHistoryThisFrame) nextHistoryAppendAtMs = nowMs + HISTORY_APPEND_INTERVAL_MS;
    for (const orbit of ORBITS) {
      const sample = sampleOrbit(orbit, elapsedSeconds);
      setVessel({
        mmsi: orbit.mmsi,
        messageType: 18,
        navStatus: null,
        sourceId: SourceId.EdgeBridge,
        rateOfTurn: null,
        lng: sample.lng,
        lat: sample.lat,
        sog: sample.sog,
        cog: sample.cog,
        trueHeading: sample.cog,
        timestampUnix,
        flags: VESSEL_FLAG_HAS_FIX | VESSEL_FLAG_IS_MOVING | VESSEL_FLAG_HAS_IDENTITY,
      });
      if (appendHistoryThisFrame) {
        const point: VesselHistoryPoint = {
          lng: sample.lng,
          lat: sample.lat,
          sog: sample.sog,
          cog: sample.cog,
          trueHeading: sample.cog,
          timestampUnix,
        };
        appendHistoryPoint(orbit.mmsi, point, timestampUnix);
      }
    }
    rafHandle = window.requestAnimationFrame(frame);
  };

  rafHandle = window.requestAnimationFrame(frame);
}

function stopDemo(): void {
  if (rafHandle === 0) return;
  window.cancelAnimationFrame(rafHandle);
  rafHandle = 0;
  // Drop our injected vessels from the live store. The cascade in
  // `vessel-history.store` (subscribes to `$vessels.listen`) drops
  // history and Kalman state automatically in the same event-loop
  // tick, so a separate history `.set` here would be redundant - and
  // would race the cascade by firing trail-rebuild listeners twice.
  const next = { ...$vessels.get() };
  let mutated = false;
  for (const mmsi of DEMO_MMSIS) {
    if (next[mmsi] !== undefined) {
      delete next[mmsi];
      mutated = true;
    }
  }
  if (mutated) $vessels.set(next);
}

let unsubscribe: (() => void) | null = null;

/**
 * Wire the controller to the demo toggle. Called from React mount via
 * a tiny effect (see `<DemoModeProvider>` if it grows; currently the
 * App calls `installDemoController` once on boot). Idempotent: a
 * repeat install is a no-op until `uninstallDemoController` is called.
 */
export function installDemoController(): void {
  if (unsubscribe !== null) return;
  // Apply the current value first so a toggle that flipped before this
  // function ran still produces the expected demo state.
  if ($demoMode.get()) startDemo();
  unsubscribe = $demoMode.subscribe(value => {
    if (value) startDemo();
    else stopDemo();
  });
}

export function uninstallDemoController(): void {
  if (unsubscribe === null) return;
  unsubscribe();
  unsubscribe = null;
  stopDemo();
}

/**
 * Hard tunables exposed for unit tests; not part of the public API.
 */
export const __test = {
  DEMO_MMSIS,
  ORBITS,
  sampleOrbit,
  HISTORY_APPEND_INTERVAL_MS,
};
