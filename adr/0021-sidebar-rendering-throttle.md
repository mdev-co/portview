# ADR 0021 - Sidebar rendering: throttled list view and per-key row subscriptions

**Status:** Accepted
**Date:** 2026-05-29
**Supersedes:** none
**Related:** ADR-0001 (atomic vessel store - Vault only, see ADR-0001 in `/sps/docs/adr/`), ADR-0017 (web deploy hardening)

## Context

Chrome DevTools performance profiling of the live vessel sidebar with 46 vessels in the store showed long-interaction warnings: 412 ms total response on a pointer click, dominated by 379 ms of input delay. The same trace recorded four consecutive 600 ms React render blocks while the main thread was idle of user work, attributed via the call tree to a function call originating in `apps/web/src/modules/telemetry/telemetry-client.ts` and resolving inside `react-dom_client.js` `beginWork` at 85.8 percent total time.

The cause was a mismatch between the rate at which the store accepts updates and the rate at which the React tree reconciles. The store, by design, absorbs every WebSocket frame at the ingest rate (10-20 Hz with an active antenna) using atomic `setKey` writes. The sidebar `useVesselList()` hook however subscribed via `useStore($vessels)` to the entire map, so every per-key write fanned out a full list reconciliation through forty-six `VesselListItem` instances, each composed of a row, status dot, label, optional category badge, actions block, and a details panel. Two child components (`Actions`, `Details`) further subscribed to entire stores (`$vesselKalmanState`, `$disabledTrailMmsis`) and re-rendered on every cross-vessel update.

The published architecture in `apps/web/src/modules/selection/hooks/use-selected-vessel.ts` and `use-vessel-static.ts` already establishes the per-key subscription pattern via `useSyncExternalStore` with a filtered `listen` closure. The list view and the two child components had not adopted it.

## Decisions

### D-21-1: Sidebar list view consumes the store through a throttled subscription

A new hook `useThrottledVesselList(windowMs = 250)` lands in `apps/web/src/modules/selection/hooks/`. It listens to `$vessels` directly but commits to React state at most once per window through a trailing-edge timer. The first emit in a quiet window schedules the commit; subsequent emits before the timer fires are folded into the same commit.

The window default is 250 ms. The AIS broadcast schedule bounds this trade-off: anchored vessels report every three minutes, underway vessels every two to ten seconds, so a list refreshed at four hertz never looks behind. The per-row live time tick uses ref plus DOM mutation and is unaffected.

`useVesselList()` becomes a thin alias around the throttled hook to keep the consumer surface unchanged. `useGroupedVesselList()` reads through `useVesselList()` and inherits the throttle for free.

### D-21-2: Row-level subscriptions filter by mmsi at the listen boundary

Two new hooks land alongside `useVesselStatic` and follow the same shape:

- `useVesselKalmanForMmsi(mmsi)` replaces `useStore($vesselKalmanState)` in `VesselListItem.Actions`.
- `useTrailEnabledForMmsi(mmsi)` replaces `useStore($disabledTrailMmsis)` in `VesselListItem.Details`.

Both use `useSyncExternalStore` with a subscribe closure that retains the last per-mmsi value and only invokes `onChange` when the next snapshot differs at that key. Updates targeting other mmsis do not propagate to the consumer.

### D-21-3: Throttle behaviour lives in a pure helper for testability

`createThrottledListener(listen, onCommit, windowMs)` exports the schedule logic decoupled from React. The hook composes it inside `useEffect`. The test suite exercises the helper directly with `vi.useFakeTimers()` so the throttle window, coalescing, post-commit rearming, and dispose teardown are covered without a renderer.

### D-21-4: Selection module keeps ownership of the per-row hooks

`useTrailEnabledForMmsi` reads from `@/modules/map/state/trail-visibility` but lives under `modules/selection/hooks/` next to `useVesselStatic` and `useSelectedVessel`. The consumer side owns the hook, the store side owns the data. Same convention the existing per-key hooks follow.

## Consequences

- Position frames continue to land in the store at ingest rate; the sidebar list now reconciles at most four times per second regardless of frame rate. The map render path is unaffected and continues to consume the store directly.
- Toggling a trail for one vessel no longer re-renders forty-five other `Details` panels. Updating the kalman state for one vessel no longer re-renders forty-five other `Actions` buttons.
- Sidebar list staleness is bounded by the throttle window. The number is configurable per consumer via the `windowMs` argument; tests pin it to a fake timer rather than a wall clock.
- Tab visibility refresh (`telemetry-client.ts`) sequence is preserved because the throttle only delays the commit, never drops a snapshot. Reconnects flush a fresh snapshot, which lands in the next commit.

## Verification

- `apps/web/src/modules/selection/__tests__/use-throttled-vessel-list.test.ts` covers the throttle helper.
- `apps/web/src/modules/selection/__tests__/per-key-subscription.test.ts` covers the listen-filter closure used by both per-mmsi hooks against the live stores.
- Manual: Chrome DevTools performance recording with the same scenario (46 vessels, pointer click) repeated. Expectation: long-interaction warning gone, INP under 200 ms, no `beginWork` blocks of hundreds of milliseconds tied to telemetry-client callbacks.

## What this does not address

- Virtualisation of the sidebar list (only the visible rows render). Not necessary at 46 vessels; revisit once the antenna upgrades push the list past two hundred.
- Map-side render path. The map already consumes the store and renders via MapLibre layers, not React components per vessel. ADR-0018 covers the style engine.
- Map markers reading kalman state on every frame. The map's render is throttled by the GeoJSON build cadence in `apps/web/src/modules/map/` and is out of scope here.
