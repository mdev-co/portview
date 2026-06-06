/**
 * Engine contract. A swap from deck.gl to (say) three.js or Cesium
 * means writing a new class that implements this interface; the
 * `<Flagship3DLayer />` consumer code stays unchanged.
 *
 * The map parameter is concretely typed as MapLibre's `Map` rather
 * than a structural alias because every engine we will ever ship
 * binds to the same base map (deck.gl, three.js raw, Cesium overlay
 * - all of them speak the MapLibre canvas). Forcing a structural
 * type here gains nothing and trips the standard TypeScript variance
 * trap on `addControl`'s narrower parameter signature.
 */
import type { Map as MaplibreMap } from 'maplibre-gl';

/**
 * Rendering Abstraction Layer (RAL) for the 3D vessel models on top
 * of the MapLibre canvas. Pure framework / library-agnostic contract:
 * the rest of the app speaks `RenderableVessel` and `IGeospatialRenderEngine`
 * exclusively; whether the concrete engine is deck.gl, three.js, or
 * something else is a swappable implementation detail.
 *
 * The contract is deliberately minimal: attach to an existing map
 * instance, push the current vessel set, detach on teardown. The
 * engine internally owns its overlay / scenegraph / GL resources;
 * the caller only feeds it data.
 */

/**
 * Vessel data the 3D engine needs to render one model. Pulled out of
 * the upstream `LiveVessel` shape so the engine never depends on AIS
 * fields it does not consume (sog, navStatus, message type, etc.).
 */
export type RenderableVessel = {
  /** Stable identity for layer key reuse (string form of the MMSI). */
  readonly id: string;
  readonly lng: number;
  readonly lat: number;
  /** Course over ground in degrees, used to yaw the model. */
  readonly heading: number;
  /** URL of the GLB / glTF scenegraph to render at this position. */
  readonly modelUrl: string;
  /**
   * Per-model uniform scale multiplier. Real ship lengths range from
   * ~20 m (tug) to ~400 m (container ship); a single scale baked into
   * the GLB cannot fit both, so the flagship config provides a
   * per-vessel override here.
   */
  readonly scale: number;
};

export type IGeospatialRenderEngine = {
  /**
   * Bind the engine to the running MapLibre instance. Idempotent in
   * principle, but callers should `detach()` before re-attaching to
   * release GL resources on the previous map.
   */
  readonly attach: (map: MaplibreMap) => void;
  /** Push the current vessel set. Safe to call before attach (no-op). */
  readonly setVessels: (vessels: ReadonlyArray<RenderableVessel>) => void;
  /** Release every overlay / layer / texture / buffer the engine owns. */
  readonly detach: () => void;
};
