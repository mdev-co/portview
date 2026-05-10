# ADR-0010: Static-data delivery over /ws/telemetry as discriminated JSON

- Status: Accepted
- Date: 2026-05-10

## Context

D5 shipped a binary `VesselUpdateFrame` (40 bytes) on `/ws/telemetry` carrying position fields only. AIS ITU-R M.1371-5 type 5 (Class A static and voyage data) carries strings the binary codec cannot represent: `vesselName`, `callSign`, `destination`. Without these the sidebar displays only the 9-digit MMSI, which makes the demo unreadable to a non-technical viewer and forces a recruiter to take "this is real AIS" on faith.

The decision is how to deliver the type-5 fields to the FE. Four options were on the table; the choice has knock-on effects on connection count, FE state shape, decoder complexity and the protocol contract on `/ws/telemetry`.

## Decision

Deliver static-data updates on the existing `/ws/telemetry` channel as JSON text frames discriminated by `kind: "vessel.static"`. Position updates remain binary on the same channel.

Mechanisms:

1. **New `vessel.static.update` event** on the in-process bus. `IngestService` publishes it whenever a validated `AisMessage` has `messageType === 5`, alongside the existing `vessel.update` event (the binary path is unchanged).
2. **`buildVesselStaticFrame`** drops upstream-only fields (`repeatIndicator`, `aisVersion`, `epfdType`, `dte`) the FE never reads. The wire frame keeps `kind` + identification + 7 voyage fields.
3. **TelemetryWsGateway** subscribes to both events. Binary path uses `client.send(buf, { binary: true })`; static path uses `client.send(json, { binary: false })`. A shared `broadcast()` method handles backpressure for both kinds.
4. **FE dispatch** narrows on `data instanceof ArrayBuffer` (binary) vs `typeof data === 'string'` (text). Text frames go through a manual type guard (no Zod at the boundary) and land in a separate `$vesselStaticData` Nano Stores `map()`. Eviction is sweep-on-orphan against `$vessels` membership: when the position TTL drops a vessel, the static entry follows.
5. **VesselListItem** reads from both stores via per-MMSI `useSyncExternalStore` hooks. When static is present, the row title becomes the vessel name and the MMSI moves to a subtitle; the details panel adds 7 ITU-spec fields.

## Pipeline

![D7-PR2 pipeline - dual-frame protocol on /ws/telemetry](./0010-pipeline.png)

> Source: [`0010-pipeline.d2`](./0010-pipeline.d2). SVG export: [`0010-pipeline.svg`](./0010-pipeline.svg). Re-render with `d2 adr/0010-pipeline.d2 adr/0010-pipeline.png --theme=8 --pad=20`.

## Tradeoffs

- One channel carries two frame kinds. Operationally simpler than two endpoints (single auth surface, single reconnect lifecycle, one `bufferedAmount` to monitor) but the FE dispatch must check `data` type on every message. The check is one `instanceof` and one `typeof`; the cost is structural, not runtime.
- Static frames are JSON text, not binary. Bandwidth penalty is real (a static frame is roughly 200-280 bytes of JSON versus the 40-byte binary frame), but type-5 messages arrive once per voyage segment, not at position cadence. Total static traffic is bounded by the active fleet size, not by message rate.
- The discriminator key (`kind: "vessel.static"`) reserves a namespace for future non-binary frame kinds (AtoN type 21, base stations type 4, server-side notifications). Adding a kind is a one-line change in the FE dispatch and a new `@OnEvent` handler on the gateway, no protocol renegotiation.
- The push-only contract on `/ws/telemetry` was tightened: the gateway now closes any client-to-server frame with status 1003, not just text frames. Browser clients in this codebase do not send; the change forecloses a class of misuse without a behaviour cost.
- The FE keeps two stores, not one. Splitting prevents the high-frequency position TTL from churning over the static entries on every sweep, and lets list components subscribe to whichever cadence they need. Cost: two subscriptions per sidebar row instead of one.
- Manual type guard at the JSON boundary instead of Zod. Per L8 (validation as side-effect-laden hidden source of truth), the wire contract lives in `packages/shared/src/types/vessel-static.ts` as a plain TypeScript type; the guard is 30 lines of explicit field checks. Reads better than a Zod schema and fails closer to the parse site.

## Alternatives considered

- **Second WebSocket endpoint `/ws/static`.** Rejected: doubles the connection count on the FE for a low-frequency channel, duplicates the reconnect lifecycle and the auth check (when auth lands), and the routing benefit (filtering at the transport layer) is not real because the gateway already filters by event name.
- **Extend the binary codec to carry strings.** Rejected: adds variable-length fields to a fixed-width frame, breaks the "every byte has a fixed meaning" invariant, and the codec is no longer testable as a pure transformation on a fixed buffer. The invariant is more valuable than the bandwidth saving.
- **Separate REST endpoint `/api/vessels/:mmsi/static` polled per selection.** Rejected: an extra round-trip per row click introduces a perceptible delay in the sidebar, requires a Prisma read on a hot path (the static cache lives in memory anyway), and it does not solve the case where a viewer wants to see names of vessels they have not clicked.
- **Server-Sent Events (SSE) on a third path.** Rejected: another transport stack to maintain, no clear win over WebSocket text frames, and the existing reconnect logic for `/ws/telemetry` already handles drops and backoff.

## Evolution

- Add Class B static (AIS type 24) once the parser in `@sps/shared` covers it. The frame shape and the `kind` discriminator are both ready; only the IngestService publish guard and the AIS Stream adapter need to know about the new payload kind.
- Persist static data across page reloads. A 5-line `localStorage.setItem` on every `setVesselStatic` and a one-shot rehydrate on app boot would survive refresh; a Dexie-backed history table is a separate decision (D8) that turns the cache into a queryable record of voyages.
- AtoN type 21 and base station type 4 reuse the discriminator pattern with `kind: "aton.update"` / `kind: "station.update"`. The gateway gains one `@OnEvent` per kind, the FE one dispatch branch.
- Server-declared client filters. Today every connected client receives every static frame for every active vessel. A `Subscribe { bbox: [...] }` upstream message would let the FE narrow to a viewport and cut bandwidth at the transport layer, but it conflicts with the current push-only contract (see ADR-0007). A future extension would relax that contract for control frames only, keeping data direction one-way.
