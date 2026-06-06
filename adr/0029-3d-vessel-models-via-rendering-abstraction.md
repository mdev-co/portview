# ADR 0029 - 3D vessel models behind a rendering abstraction layer

**Status:** Accepted
**Date:** 2026-06-06
**Supersedes:** none
**Related:** ADR-0017 (map style engine), ADR-0022 (MapLibre vessel layer transition tracking), ADR-0028 (app shell slot architecture)

## Context

The operator surface renders every AIS-tracked vessel as a 2D symbol (arrow + ring + label) on a MapLibre raster basemap. The next iteration brings a curated subset of locally relevant vessels - the "flagships" - as 3D scenegraph models that sit on the water plane and rotate to their AIS course over ground. Three concrete needs:

1. **Visual identification.** A specific small fleet (the Biała Flota passenger boats, harbour tug, port pleasure craft) should read at a glance, not as identical arrows.
2. **Pitched-camera readability.** The map now runs a pitched view with sky and fog; flat 2D markers float disconnected from the world. 3D hulls anchor the scene at port zoom.
3. **Demo polish without abandoning the 2D pipeline.** Most vessels stay flat; only the curated subset upgrades.

Architectural questions:

- How to render 3D meshes on top of MapLibre without coupling consumer code to a specific 3D library?
- How to handle the visual handoff so the same vessel is not painted twice (2D symbol below the 3D model)?
- How to keep the bundle cost out of the default first-paint critical path?

## Decisions

### D-29-1: Rendering abstraction layer (`IGeospatialRenderEngine`)

A two-method interface (`attach`, `setVessels`, `detach`) defines the contract for any 3D rendering backend. Consumer code (`Flagship3DLayer`) never imports deck.gl directly - it talks to the interface. The concrete `DeckGlEngine` is the only file that touches `@deck.gl/mapbox` and `@deck.gl/mesh-layers`.

```ts
export type IGeospatialRenderEngine = {
  readonly attach: (map: MaplibreMap) => void;
  readonly setVessels: (vessels: ReadonlyArray<RenderableVessel>) => void;
  readonly detach: () => void;
};
```

A swap to three.js raw, Cesium globe, or custom WebGPU is one new file plus a single constructor change. Keeps option value at the cost of one indirection.

### D-29-2: deck.gl `MapboxOverlay` in overlay mode (`interleaved: false`)

`MapboxOverlay` plugs deck.gl into the MapLibre instance via `addControl`. Overlay mode (separate canvas above the basemap) was preferred over interleaved mode (mixed render pass) for two reasons: MapLibre 5.x has documented compatibility friction with deck.gl's interleaved pipeline, and the basemap is a flat raster so the visual result is identical. Interleaved becomes the right choice once 3D building extrusions need Z-occlusion with the vessel models - revisit then.

### D-29-3: One `ScenegraphLayer` per unique model URL

Vessels are grouped by `modelUrl` before construction. deck.gl batches every vessel sharing the same GLB inside one `ScenegraphLayer` and reuses GPU buffers across `setProps` calls keyed on a stable layer id (`flagship-3d-<url>`). Per-vessel scale + orientation are data-driven via `getScale`/`getOrientation` callbacks.

### D-29-4: 2D markers stay opacity-zero (not filter-hidden) for flagships in 3D mode

Filtering flagship MMSIs out of the 2D vessel layers (the original approach) also removed them from MapLibre's hit-test index, so the operator could no longer click a flagship to select it. The current `Flagship2DHider` wraps each opacity paint property with `case isFlagship 0 baseline`, leaving the feature in the index for `queryRenderedFeatures` and `click` events. Restoration uses `setPaintProperty(prop, null)` (MapLibre's "fall back to spec value" contract) so no captured-baseline staleness can lock a marker permanently invisible.

The trail polyline is deliberately excluded from the hider - the 3D model glides over it and the line reads as the vessel's wake.

### D-29-5: Vendor split keeps deck.gl out of the initial chunk

`vendor-3d` Vite manualChunk holds `@deck.gl/*` (~234 KB gzip). The chunk only loads when `Flagship3DLayer` mounts (i.e. when the user toggles 3D on). First paint is unaffected.

### D-29-6: Heading source matches the 2D arrow

The 3D `getOrientation` reads `vessel.trueHeading ?? vessel.cog ?? 0`, the same chain `vesselsToGeoJSON` uses for the 2D arrow icon. A drifting tug whose bow points away from its motion vector will show the same orientation in 2D and 3D - no visual disagreement between the two layers.

## Consequences

- A new 3D backend (three.js, Cesium) requires only a new `IGeospatialRenderEngine` implementation plus a one-line swap in `Flagship3DLayer`. No consumer churn.
- The 3D toggle becomes a true graceful-degrade lever: low-end GPUs lose nothing else when 3D is off, and `Flagship2DHider` automatically restores opacity through the spec-fallback path.
- Bundle gain on first paint is preserved by the `vendor-3d` chunk split; the initial JS budget stays under the existing gate.
- A future move to interleaved mode for 3D building Z-occlusion is one constructor argument flip - no architectural rewrite.
- Operators on a quiet AIS day can spawn a synthetic demo pair (see the demo toggle) to verify the smoothing, model orientation and trail rendering without waiting for live traffic; the demo controller injects vessels into the same `$vessels` store that real broadcasts hit.

## Verification

- `pnpm --filter @sps/web test`: full suite green (212 tests).
- `pnpm --filter @sps/web typecheck` + lint clean.
- Manual verification: 3D toggle on/off cycles restore 2D markers without residual opacity drift; selecting a flagship via the now-invisible 2D click target opens the detail panel; demo toggle spawns two synthetic vessels that orbit the port at rAF cadence and disappear cleanly on toggle off.

## What this does not address

- Vessel-mounted billboard label ("callout" with name + speed + course on hover/click). Deferred to a follow-up PR.
- Z-occlusion between flagship models and port building extrusions. Today the 3D model paints on top of buildings; interleaved mode + a depth-sorted render order will fix this when the port-buildings layer warrants it.
- LOD for the curated flagship set. The fleet is small enough (six vessels) that full-poly GLBs per vessel are cheap; if the set grows past a few dozen, a billboard-quad LOD at far zoom will pay back.

## Diagram

![3D vessel models RAL architecture](./0029-3d-vessel-models-via-rendering-abstraction.png)

> Source: [`0029-3d-vessel-models-via-rendering-abstraction.d2`](./0029-3d-vessel-models-via-rendering-abstraction.d2). Re-render with `d2 adr/0029-3d-vessel-models-via-rendering-abstraction.d2 adr/0029-3d-vessel-models-via-rendering-abstraction.png --theme=8 --pad=20`.
