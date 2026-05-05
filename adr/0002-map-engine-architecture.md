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
