# ADR 0022 - Map vessel layer: transition-tracked rAF + listener-driven trails

**Status:** Accepted
**Date:** 2026-06-01
**Supersedes:** none
**Related:** ADR-0011 (dead-reckoning extrapolation freeze), ADR-0021 (sidebar rendering throttle)

## Context

After ADR-0021 landed the sidebar INP regression, a Chrome DevTools performance recording on a five-second window with 60 vessels active still showed `maplibre-gl.js` as the dominant cost - roughly 1 070 ms of total time, ~21 % of the main thread. The hot path resolved to `apps/web/src/modules/map/components/vessel-layer.tsx`, which on every frame rebuilt both vessel and trail GeoJSON sources from scratch.

Two observations made the cost asymmetric to the work that actually changed:

1. **Trails are stable between AIS broadcasts.** Position history mutates only when a new fix arrives (every 2-180 s per vessel). Rebuilding the trail FeatureCollection sixty times per second during the idle interval is pure waste.
2. **Vessel positions only animate for 1.5 s after each AIS report.** `smoothedDisplayPosition` performs a cubic-eased lerp between the previous and the latest fix; once that transition completes, the displayed coordinate is identical to the raw fix until the next report. Rebuilding the vessel FeatureCollection on every frame even when no vessel is transitioning is the same kind of waste.

The current code drives `render()` from both a `requestAnimationFrame` loop and five Nano Stores listeners. The combination was meant to be defensive ("never miss an update") but in practice meant render fires 60-80 times per second whether or not the data has changed since the last frame.

## Decisions

### D-22-1: Trails are listener-driven only, never on a rAF tick

The trail source rebuilds exactly when an input that determines its content changes: `$vesselPositionHistory` (new fix appended), `$vesselStaticData` (category colour mapped from ship type), `$selectedMmsi` (highlight stroke), `$trailVisibilityPredicate` (show-all-trails toggle, per-vessel disable set). All four are wired as direct `listen` subscriptions in the same `useEffect` that owns the layer lifecycle. The trail-rebuild path no longer participates in rAF.

In steady state this rebuilds at the AIS broadcast cadence - a handful of times per minute - rather than sixty times per second. The cost reduction is proportional.

### D-22-2: Vessels are rebuilt on a rAF tick only while an animation is active

A module-scope `Set<number>` of in-flight transitions tracks which vessels are inside their 1.5 s lerp window. `$vessels.listen` updates the set on every per-key write: the touched MMSI is added, marked with the `performance.now()` timestamp at which the lerp began. The rAF tick checks the set:

- If empty: skip the rebuild entirely, schedule the next rAF, return. Cost is one closure call per frame.
- If non-empty: rebuild the vessel GeoJSON, write to the source, and prune entries whose transition has completed (`now - startedAt >= TRANSITION_DURATION_MS`).

When the antenna is delivering frames continuously the set is almost always non-empty, so the rebuild runs near-frame-rate. When the antenna goes quiet, the set drains and the tick costs effectively nothing.

`$vesselStaticData` and `$selectedMmsi` also influence vessel feature properties (name, category, selected flag). Both are wired as separate listeners that mark _every currently-displayed vessel_ as active for one tick, so the next rAF rebuild picks up the new properties. This is a coarse but correct approach: the alternative of tracking property-only changes per-MMSI does not pay back its complexity at fleet sizes this project targets.

### D-22-3: rAF cap stays at native frame rate, no manual throttling

The cost reduction comes from skipping rebuilds entirely when nothing is animating, not from artificially capping the frame rate. When a vessel is transitioning, the user expects smooth interpolation at the device's native frame rate - that's the whole point of the lerp. Capping to 30 Hz would visibly stutter a single moving marker without saving meaningful work compared to D-22-2.

MapLibre paints at the GPU's frame rate regardless of how often `setSourceData` is called. The decisions above shape how often _we_ generate new data, not how often the canvas refreshes.

### D-22-4: Idle frames remain cheap, no event-loop pinning

The rAF tick is preserved as a continuous loop even when the active-transitions set is empty. An idle tick is a single `if (set.size === 0) return` - nanoseconds. Tearing the rAF down and rebuilding it on each transition would add wakeup latency to the first frame of an animation; the trivial idle cost is preferable.

When the tab is hidden, the browser pauses rAF entirely. The bridge keeps ingesting and the store keeps absorbing frames; the layer catches up on the next visible frame because the transitions are tracked by wall-clock timestamps, not frame counts.

## Consequences

- Trail-rebuild cost falls from ~65 invocations per second to ~5 per minute at typical broadcast cadence.
- Vessel-rebuild cost is bounded by _how many vessels are mid-transition_, not by _how many vessels exist_. A 200-vessel fleet that is mostly stationary costs about the same as a 20-vessel fleet that is mostly underway.
- The active-transitions set is module-scope state shared between the listener and the rAF tick. It survives layer remounts because both write to the same closure. The teardown path clears it on unmount.
- `pruneTrackerState` in `dead-reckoning-tracker.ts` already removes per-vessel tracker entries when the active set passed to `vesselsToGeoJSON` shrinks; that contract continues to hold under the new tick gate.
- Web Worker offload of GeoJSON construction (further reduction to the message-passing cost) is intentionally deferred. The transition-tracked tick reduces main-thread load enough that the Worker complexity is not justified at this fleet size. Re-evaluate post-AWS-PMTiles when the tile path itself adds GPU/main-thread work.

## Verification

- Chrome DevTools performance recording, same scenario (60 vessels, antenna active, five-second window). Expectation: `maplibre-gl.js` total time drops below 300 ms, no `setSourceData` calls for the trail source while no `$vesselPositionHistory` mutation has fired in that window.
- Unit tests under `apps/web/src/modules/map/lib/__tests__/` cover `pruneTrackerState` and the lerp behaviour of `smoothedDisplayPosition`; new tests pin the listener wiring and the transition-set semantics that govern the rAF tick.
- Manual: tab hidden for 30 s, then refocused. Expectation: no torpedo - vessels jump to current positions without an animation backlog (pause detection in `dead-reckoning-tracker` handles this; the new tick gate preserves the same pause path).

## What this does not address

- Web Worker offload of `vesselsToGeoJSON` / `trailsToGeoJSON`. Deferred until the main thread shows a measurable bottleneck again.
- Source layer-level diffing (mutate coordinates in place rather than rebuilding the FeatureCollection). MapLibre exposes `setFeatureState` for properties but not coordinates; coordinate diffing would require a custom data store and is out of scope.
- Trail decimation. Long trails for slow-moving vessels stay verbose; the existing trail buffer caps at `VESSEL_HISTORY_MAX_POINTS` per MMSI and that cap is sufficient for now.
