# ADR-0002: Map engine architecture

- Status: Accepted
- Date: 2026-05-05

## Decision

Map rendering routes through a single controller that delegates to a swappable engine adapter. The current adapter targets MapLibre GL. Adapters register at app boot; the controller resolves them by type at runtime.

Consumers subscribe to a single state surface that mirrors the controller lifecycle. Imperative operations (camera, source data) are exposed on the controller; the underlying engine instance is reachable through an explicit escape hatch.

## Tradeoffs

- More files than a colocated component, in exchange for a clean engine boundary
- Async lifecycle API in exchange for accurate ready-state propagation
- Explicit lifecycle control in exchange for survival across React re-mounts
- Universal subscription surface in exchange for one extra indirection over a direct hook

## Evolution

- Additional engines (e.g. Cesium for 3D, OpenLayers for raster-heavy thematic): implement the engine interface, register at boot.
- High vessel count: separate vessel layer module composes on the controller.
- Worker offload: the controller is reachable from non-React contexts.

## Future-proofing: 3D vessel rendering

3D vessel models (textured GLTF meshes per ship type, animated heading and rate-of-turn) are out of scope for the MVP and remain a post-launch stretch. The architecture already accommodates them with no refactor required:

- A future Three.js or deck.gl `ScenegraphLayer` adapter implements the same engine interface and registers next to the 2D adapter. Consumers do not change.
- AIS type 5 dimensions (bow / stern / port / starboard offsets) are already captured at the parser boundary, so 3D meshes can be scaled 1:1 to vessel length and beam.
- True heading and rate-of-turn from position reports are already exposed, so rotation animation has the inputs it needs.
- The controller's atomic engine swap means a runtime "2D / 3D" toggle is a single `useEngine` call away.

3D is deferred for performance reasons (mobile GPU, asset weight) and time budget, not architectural ones.
