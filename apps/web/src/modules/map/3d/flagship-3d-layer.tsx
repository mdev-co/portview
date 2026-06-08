import { useEffect } from 'react';
import { $vessels } from '@/modules/telemetry';
import { useStore } from '@nanostores/react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { useMapEngine } from '../hooks/use-map-engine';
import { useMapState } from '../hooks/use-map-state';
import { DeckGlEngine } from './deck-gl-engine';
import { FLAGSHIP_MMSI_SET, FLAGSHIP_VESSELS } from './flagships.config';
import { $threeDMode } from './three-d-toggle.atom';
import type { IGeospatialRenderEngine, RenderableVessel } from './types';

/**
 * Duration of the surfacing animation. ~1.5 s feels intentional - long
 * enough that an observer registers the motion, short enough that they
 * are not waiting for the model to finish.
 */
const RISE_DURATION_MS = 1_500;

/**
 * Depth (metres below configured altitude) the model starts at on
 * mount. 80 m is below the mesh of every flagship hull in the demo so
 * the model is completely invisible at progress = 0, then animates up
 * to its configured altitude as progress -> 1. Underwater start works
 * for ships specifically; for a future aircraft variant we would flip
 * the sign and start above the camera ceiling instead.
 */
const RISE_FROM_DEPTH_M = 80;

/**
 * Cubic ease-out. Fast initial pop above the waterline, gentle settle
 * at the target altitude. Linear felt mechanical, ease-in felt
 * sluggish; this curve reads as "boat surfacing under its own weight".
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Mounts the 3D flagship layer onto the running MapLibre instance.
 *
 * Lifecycle:
 *   - On map `ready` AND 3D toggle ON: construct a `DeckGlEngine`,
 *     attach it to the MapLibre map, push the initial flagship set,
 *     subscribe to `$vessels.listen` for per-key updates.
 *   - The `listen` callback fires for EVERY vessel change. We filter
 *     to flagship MMSIs by checking `FLAGSHIP_MMSI_SET.has(...)` so
 *     a non-flagship update incurs only one Set lookup, not a full
 *     re-render of the 3D scene.
 *   - On mount the rendered altitude is offset downward by
 *     `RISE_FROM_DEPTH_M` and ramps to its configured value over
 *     `RISE_DURATION_MS` via a requestAnimationFrame loop. The 2D map
 *     and vessel canvas paint immediately; the 3D models surface a
 *     beat later as a design moment. Combined with the
 *     `<ThreeDMountGate>` wrapper in `<MapView>`, this keeps the
 *     deck.gl chunk out of the Lighthouse measurement window.
 *   - On cleanup (toggle OFF, map swap, route unmount): cancel the
 *     animation frame, unsubscribe the listener AND `engine.detach()`
 *     to release the deck.gl overlay's GL resources.
 *
 * Why this lives behind the abstract `IGeospatialRenderEngine`
 * interface: the consumer code below never imports deck.gl directly,
 * so a future swap to a different 3D engine (three.js raw, Cesium
 * globe, custom WebGPU) means swapping the `new DeckGlEngine()` line
 * for a new constructor. Everything else stays.
 */
export function Flagship3DLayer(): null {
  const controller = useMapEngine();
  const { status } = useMapState();
  const threeDOn = useStore($threeDMode);

  useEffect(() => {
    if (status !== 'ready') return;
    if (!threeDOn) return;
    const map = controller.getRawEngine() as MaplibreMap | null;
    if (map === null) return;

    const engine: IGeospatialRenderEngine = new DeckGlEngine();
    engine.attach(map);

    const mountedAt = performance.now();

    function surfaceProgressAt(now: number): number {
      const elapsed = now - mountedAt;
      if (elapsed >= RISE_DURATION_MS) return 1;
      if (elapsed <= 0) return 0;
      return easeOutCubic(elapsed / RISE_DURATION_MS);
    }

    function pushVessels(progress: number): void {
      const snapshot = $vessels.get();
      const out: RenderableVessel[] = [];
      const submergedOffsetM = (progress - 1) * RISE_FROM_DEPTH_M;
      for (const cfg of FLAGSHIP_VESSELS) {
        const v = snapshot[cfg.mmsi];
        if (v === undefined) continue;
        if (v.lng === null || v.lat === null) continue;
        out.push({
          id: String(cfg.mmsi),
          lng: v.lng,
          lat: v.lat,
          // Match `vesselsToGeoJSON`: AIS gives both COG (motion
          // bearing) and trueHeading (compass bow direction). They
          // diverge when a vessel is drifting, manoeuvring at slow
          // speed, or moored on a current; the 2D arrow uses
          // trueHeading-then-cog, the 3D model has to do the same or
          // the bow and the arrow point in different directions on a
          // manoeuvring tug.
          heading: v.trueHeading ?? v.cog ?? 0,
          modelUrl: cfg.modelUrl,
          scale: cfg.scale,
          altitude: cfg.altitudeOffset + submergedOffsetM,
        });
      }
      engine.setVessels(out);
    }

    let rafHandle: number | null = null;
    function animateSurface(now: number): void {
      const progress = surfaceProgressAt(now);
      pushVessels(progress);
      if (progress < 1) {
        rafHandle = requestAnimationFrame(animateSurface);
      } else {
        rafHandle = null;
      }
    }
    rafHandle = requestAnimationFrame(animateSurface);

    const unsubscribe = $vessels.listen((_value, _oldValue, changedKey) => {
      // changedKey === undefined fires on bulk `$vessels.set()`
      // (TTL sweep) - re-push the whole flagship set in that case.
      // While the surfacing animation is still running, the running
      // RAF loop will already re-push on its own next frame, so we
      // skip the listener-driven push to avoid double work; once the
      // ramp finishes the listener takes over as the only writer.
      if (rafHandle !== null) return;
      const progress = surfaceProgressAt(performance.now());
      if (changedKey === undefined) {
        pushVessels(progress);
        return;
      }
      if (FLAGSHIP_MMSI_SET.has(String(changedKey))) pushVessels(progress);
    });

    return () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      unsubscribe();
      engine.detach();
    };
  }, [controller, status, threeDOn]);

  return null;
}
