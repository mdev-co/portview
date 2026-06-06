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
 *   - On cleanup (toggle OFF, map swap, route unmount): unsubscribe
 *     the listener AND `engine.detach()` to release the deck.gl
 *     overlay's GL resources.
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

    const pushVessels = (): void => {
      const snapshot = $vessels.get();
      const out: RenderableVessel[] = [];
      for (const cfg of FLAGSHIP_VESSELS) {
        const v = snapshot[cfg.mmsi];
        if (v === undefined) continue;
        if (v.lng === null || v.lat === null) continue;
        out.push({
          id: String(cfg.mmsi),
          lng: v.lng,
          lat: v.lat,
          heading: v.cog ?? 0,
          modelUrl: cfg.modelUrl,
          scale: cfg.scale,
        });
      }
      engine.setVessels(out);
    };
    pushVessels();

    const unsubscribe = $vessels.listen((_value, _oldValue, changedKey) => {
      // changedKey === undefined fires on bulk `$vessels.set()`
      // (TTL sweep) - re-push the whole flagship set in that case.
      if (changedKey === undefined) {
        pushVessels();
        return;
      }
      if (FLAGSHIP_MMSI_SET.has(String(changedKey))) pushVessels();
    });

    return () => {
      unsubscribe();
      engine.detach();
    };
  }, [controller, status, threeDOn]);

  return null;
}
