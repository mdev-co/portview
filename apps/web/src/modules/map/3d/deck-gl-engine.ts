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
    // `interleaved: false` runs deck.gl in OVERLAY mode: a single
    // canvas painted ON TOP of the MapLibre canvas, not mixed into
    // its render pass. Interleaved mode trips known compatibility
    // bugs with maplibre-gl 5.x (custom-layer pipeline diverged from
    // upstream Mapbox); overlay mode is the safer default and
    // visually identical for a flat raster basemap. Switch back to
    // true only when MapLibre 6 stabilises the interleaved API.
    this.overlay = new MapboxOverlay({
      interleaved: false,
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
          getPosition: (d: RenderableVessel) => [d.lng, d.lat, d.altitude],
          // Orientation: the GLBs from Poly Pizza ship with the glTF
          // default convention (+Y up, -Z forward). deck.gl's mercator
          // world uses Z-up, so the `roll: 90` rotates the model 90
          // deg around its longitudinal axis so the deck plane is
          // parallel to the map plane (boat upright as seen from
          // above). Yaw applies the heading; the `180 -` offset
          // empirically points the bow in the direction of travel
          // for our Poly Pizza models (their internal forward axis
          // is the opposite of AIS COG convention). Pitch stays zero
          // because we render on a flat plane, not a sloped one.
          getOrientation: (d: RenderableVessel) => [0, 180 - d.heading, 90],
          getScale: (d: RenderableVessel) => [d.scale, d.scale, d.scale],
          // Cool-grey tint multiplied onto the model's base texture.
          // Mimics the desaturated military-grey palette used by
          // Airspace Intelligence's mission control surface. PBR
          // textures with saturated material colours (the Quaternius
          // cruise ship hull, for example) will still leak some hue
          // through this multiplier; if that reads wrong in demo we
          // swap to a monochrome GLB rather than reach for a shader.
          getColor: [180, 188, 200, 255],
          _lighting: 'pbr',
          pickable: false,
          onError: (err: Error) => {
            // Surface model load failures in dev console so we do not
            // silently render nothing. In production console.warn is
            // stripped by esbuild.drop; here it is the cheapest signal.
            console.warn('[DeckGlEngine] ScenegraphLayer error for', url, err);
          },
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
