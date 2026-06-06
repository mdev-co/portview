import type { Mmsi } from '@sps/shared';

/**
 * Static configuration for vessels that render as 3D models. The
 * set is intentionally small (two ships) for a controlled demo
 * narrative: a passenger boat carrying the port's name, and a tug
 * that almost never leaves the basin. Real production telemetry
 * fleets would invert the relationship - source the flagship list
 * from a server-side feature flag rather than a hardcoded array -
 * but for the operator portfolio demo, hardcoding is the right
 * trade-off (zero round trips, deterministic visual content).
 */
export type FlagshipConfig = {
  readonly mmsi: Mmsi;
  readonly displayName: string;
  /**
   * GLB / glTF binary asset. Looks for the file under
   * `apps/web/public/models/<file>.glb` so Vite serves it as a
   * static asset alongside the built JS bundle. The base64-inline
   * route is not used because GLBs above ~10 KB blow the bundle
   * budget; static-served keeps the initial paint untouched.
   *
   * If a local file is missing, the layer renders nothing for that
   * vessel and logs a single browser-console error from deck.gl /
   * loaders.gl. The other flagship and the rest of the map continue
   * to work, so missing models are a degrade-not-fail mode.
   */
  readonly modelUrl: string;
  /**
   * Uniform scale multiplier applied on top of whatever scale the
   * GLB ships with. Most low-poly maritime models from Sketchfab
   * arrive at 1 m to 100 m baseline; the multiplier here boosts
   * them to visible-on-zoom-12 size without warping aspect ratios.
   */
  readonly scale: number;
};

export const FLAGSHIP_VESSELS: readonly FlagshipConfig[] = [
  {
    mmsi: 261_182_777 as Mmsi,
    displayName: 'QUEEN OF SZCZECIN',
    modelUrl: '/models/queen-of-szczecin.glb',
    scale: 12,
  },
  {
    mmsi: 261_000_536 as Mmsi,
    displayName: 'FAIRPLAY XII',
    modelUrl: '/models/fairplay-xii.glb',
    scale: 8,
  },
];

/** O(1) lookup for the per-key listener path. */
export const FLAGSHIP_MMSI_SET: ReadonlySet<string> = new Set(
  FLAGSHIP_VESSELS.map(f => String(f.mmsi)),
);
