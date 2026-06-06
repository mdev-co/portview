import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import type { IGeospatialRenderEngine, RenderableVessel } from './types';

/**
 * deck.gl implementation of the rendering abstraction layer.
 *
 * Architecture choices:
 *
 *   - `MapboxOverlay` (from `@deck.gl/mapbox`) plugs deck.gl into
 *     the MapLibre instance as a `addControl()`-compatible custom
 *     layer host. This is the SINGLETON entry point - one overlay
 *     per engine instance, one engine per attached map. Subsequent
 *     `setVessels()` calls do NOT create new overlays; they push
 *     fresh layer descriptors via `overlay.setProps({ layers })`,
 *     which deck.gl diffs against existing layer IDs and reuses GL
 *     buffers wherever possible.
 *
 *   - `interleaved: true` opts into MapLibre's render pass mixing
 *     so 3D models can be Z-occluded by other MapLibre layers
 *     (e.g. future building extrusions). For our flat raster basemap
 *     this is functionally identical to overlay mode but keeps the
 *     option open without an architectural rewrite.
 *
 *   - One `ScenegraphLayer` per unique model URL, grouping vessels
 *     by their GLB. With two flagships this means at most 2 layers
 *     even if both ships share the same model (defensive against
 *     future config changes). deck.gl batches geometry within a
 *     single ScenegraphLayer, so per-vessel GPU cost is minimal.
 *
 *   - `getOrientation: [pitch, yaw, roll]` reads from `vessel.heading`
 *     (course over ground). The negative sign on yaw aligns with
 *     deck.gl's right-handed coordinate convention; +90 roll lays
 *     the model flat on the water plane instead of standing it
 *     vertically. Both flagships should arrive in their GLB with
 *     +X as bow and +Z as up; if a downloaded model uses a different
 *     convention, swap the orientation tuple in `FLAGSHIP_VESSELS`
 *     rather than reaching into this file.
 */
export class DeckGlEngine implements IGeospatialRenderEngine {
  private overlay: MapboxOverlay | null = null;
  private attachedMap: MaplibreMap | null = null;

  attach(map: MaplibreMap): void {
    if (this.overlay !== null) {
      // Caller forgot to detach first - tear down the previous
      // attachment so we don't leak the old overlay on the old map.
      this.detach();
    }
    this.overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    // MapboxOverlay implements MapLibre's IControl contract but its
    // declared type comes from @deck.gl/mapbox, not maplibre-gl, so
    // the structural cast satisfies the slightly different IControl
    // shape MapLibre's typings expect without weakening the runtime
    // contract (the addControl call uses duck typing anyway).
    map.addControl(this.overlay as unknown as IControl);
    this.attachedMap = map;
  }

  setVessels(vessels: ReadonlyArray<RenderableVessel>): void {
    if (this.overlay === null) return;
    // Group by model URL so each ScenegraphLayer fetches its GLB
    // exactly once and batches every vessel sharing that model.
    const byModel = new Map<string, RenderableVessel[]>();
    for (const v of vessels) {
      const bucket = byModel.get(v.modelUrl);
      if (bucket === undefined) {
        byModel.set(v.modelUrl, [v]);
      } else {
        bucket.push(v);
      }
    }
    const layers = Array.from(byModel.entries()).map(
      ([url, items]) =>
        new ScenegraphLayer<RenderableVessel>({
          // Stable id so deck.gl reuses the GPU buffers + scenegraph
          // cache for this URL across `setProps` calls. Without this,
          // every AIS frame would re-fetch the GLB.
          id: `flagship-3d-${url}`,
          data: items,
          scenegraph: url,
          sizeScale: 1,
          getPosition: (d: RenderableVessel) => [d.lng, d.lat, 0],
          getOrientation: (d: RenderableVessel) => [0, -d.heading, 90],
          getScale: (d: RenderableVessel) => [d.scale, d.scale, d.scale],
          _lighting: 'pbr',
          pickable: false,
        }),
    );
    this.overlay.setProps({ layers });
  }

  detach(): void {
    if (this.overlay !== null && this.attachedMap !== null) {
      this.attachedMap.removeControl(this.overlay as unknown as IControl);
    }
    this.overlay = null;
    this.attachedMap = null;
  }
}
