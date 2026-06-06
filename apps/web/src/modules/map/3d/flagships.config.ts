import type { Mmsi } from '@sps/shared';

/**
 * Static configuration for vessels that render as 3D models. The set
 * is intentionally small: a curated handful of frequently visible
 * port-resident vessels plus the synthetic demo pair. A production
 * deployment with hundreds of flagships would source this list from
 * a server-side feature flag instead of a hardcoded array; at the
 * current cardinality the round-trip cost outweighs the
 * configurability win.
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
  /**
   * Vertical offset in metres for the rendered position. Negative
   * values sit the hull lower (toward the water plane). Tune per-
   * model because the GLB's internal origin position varies between
   * sources; a negative ~2-5 m typically lands the waterline at sea
   * level for our Poly Pizza assets.
   */
  readonly altitudeOffset: number;
};

export const FLAGSHIP_VESSELS: readonly FlagshipConfig[] = [
  {
    mmsi: 261_182_777 as Mmsi,
    displayName: 'QUEEN OF SZCZECIN',
    modelUrl: '/models/queen-of-szczecin.glb',
    // Empirical: scale 300 painted a 30 km cruise ship that swallowed
    // half of Szczecin. Real passenger boat is ~40 m; the GLB ships
    // with ~100 unit length so a scale ~6 lands at the correct
    // metres-per-unit on the map at zoom 13-14. Tweak per-model.
    scale: 3,
    altitudeOffset: -4,
  },
  {
    mmsi: 261_182_517 as Mmsi,
    displayName: 'ODRA QUEEN',
    // Same passenger-cruise model as QUEEN OF SZCZECIN; both are
    // Szczecin Biała Flota fleet passenger boats around 39 m. If
    // they end up next to each other on the map this is fine - they
    // look like sister vessels, which matches their real-world class.
    modelUrl: '/models/queen-of-szczecin.glb',
    scale: 3,
    altitudeOffset: -4,
  },
  {
    mmsi: 261_000_536 as Mmsi,
    displayName: 'FAIRPLAY XII',
    modelUrl: '/models/fairplay-xii.glb',
    scale: 0.3,
    altitudeOffset: -0.5,
  },
  {
    // MS SEDINA - Biała Flota passenger boat 29 x 6 m. Same model
    // family as QUEEN / ODRA; scale ~2.2 puts the deck length close
    // to the real 29 m (the GLB ships at ~13 m baseline per unit
    // scale, calibrated against QUEEN at scale 3 = 39 m).
    mmsi: 261_184_720 as Mmsi,
    displayName: 'MS SEDINA',
    modelUrl: '/models/queen-of-szczecin.glb',
    scale: 2.2,
    altitudeOffset: -3,
  },
  {
    // Pleasure craft 12 x 4 m currently sailing Nabrzeże Polskie at
    // ~6 kn. Reuses the FAIRPLAY tug GLB at a smaller scale so we get
    // a moving model on screen immediately for visual QA - swap the
    // modelUrl out once a yacht/launch-shaped asset is in
    // `public/models/`.
    mmsi: 261_070_830 as Mmsi,
    displayName: 'SPS3686',
    modelUrl: '/models/fairplay-xii.glb',
    scale: 0.2,
    altitudeOffset: -0.3,
  },
  // Synthetic demo vessels injected by `modules/demo/demo-controller`.
  // Listed here so the existing 3D flagship pipeline picks them up
  // when the demo toggle is on; when the toggle is off they are not
  // in `$vessels` and the flagship layer skips them automatically.
  // 999_xxx_xxx is outside every ITU MID range so this can never
  // shadow a real broadcaster.
  {
    mmsi: 999_000_001 as Mmsi,
    displayName: 'SPS DEMO ALPHA',
    modelUrl: '/models/queen-of-szczecin.glb',
    scale: 3,
    altitudeOffset: -4,
  },
  {
    mmsi: 999_000_002 as Mmsi,
    displayName: 'SPS DEMO BRAVO',
    modelUrl: '/models/fairplay-xii.glb',
    scale: 0.3,
    altitudeOffset: -0.5,
  },
];

/** O(1) lookup for the per-key listener path. */
export const FLAGSHIP_MMSI_SET: ReadonlySet<string> = new Set(
  FLAGSHIP_VESSELS.map(f => String(f.mmsi)),
);
