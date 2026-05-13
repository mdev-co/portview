# ADR 0016 - VesselSummary REST shape carries the full live-vessel field set

- Status: accepted
- Date: 2026-05-13

## Context

The first REST shape for `/api/vessels` returned a minimal projection: identity (mmsi, imo, name, callSign, shipType), trip metadata (destination, eta, lastSeenAt) and the most recent position (lat, lng, sog, cog, trueHeading, navStatus, updatedAt). Several Prisma columns were left out of the Prisma `select`:

- Hull dimensions (`toBow`, `toStern`, `toPort`, `toStarboard`).
- Static draught.
- Persisted Kalman filter state (`kalmanLng`, `kalmanLat`, `kalmanVlng`, `kalmanVlat`, `kalmanUpdatedAt`).
- `rateOfTurn` and `broadcastTimestamp` on each position row.

These columns exist because the ingest worker writes them from AIS type 5 (static data) and type 1/2/3 (position reports) frames. The WebSocket gateway already streams the same field set out to live clients via binary `VesselUpdateFrame` plus JSON `VesselStaticDataFrame`. Two consumers of the same persisted state, two different shapes - one narrow, one wide.

## Decision

Widen `VesselSummary` so a single REST call returns the same field set the WebSocket frames combined carry. Specifically:

- `VesselSummary` gains `dimensions: VesselDimensions | null`, `draught: number | null`, `kalmanState: VesselKalmanState | null`.
- `VesselPositionSummary` gains `rateOfTurn: number | null` and `broadcastTimestamp: string | null`.
- `dimensions` is null-as-group: present only when all four hull offsets are non-null, otherwise null. AIS spec semantics report them together or not at all.
- `kalmanState` is null-as-group as well: present only when all five Kalman fields are non-null. A vessel with no position fix has no filter state.

No DB migration. Service-layer `select` widens; the mapper builds the two grouped nullables from the existing columns.

## Tradeoffs considered

### Stay narrow

Pros: minimal payload, fewer fields to maintain. Cons: future REST consumers (vessel detail panel, deep-linked routes, list-view filters, REST fallback for WebSocket failure) hit the same wall - need richer shape, end up adding fields one at a time over multiple PRs, drift between consumers grows. Saves nothing now, costs more later.

### Mirror the WebSocket exactly (also include sourceId, messageType, flags)

Pros: REST and WebSocket frames are byte-for-byte equivalent shapes. Cons: `sourceId`, `messageType` and `flags` are runtime concepts (which receiver, which AIS message, derived state flags) that the database does not persist. Either we widen the schema, or we synthesise sentinel values on every REST response. The first is unnecessary now; the second pretends the REST response is more authoritative than it is. Defer until either path proves itself necessary.

### Per-field nullability (chosen)

Pros: a JSON consumer that does not care about dimensions / draught / kalmanState simply ignores the keys. Type system reflects reality: missing AIS broadcasts produce nulls, not stale defaults. Cons: slightly larger payload (5-10% per vessel row in the typical case). Acceptable for a portfolio-scale workload.

## Consequences

- Vessel detail panel (future PR) consumes the new shape without an api roundtrip per field.
- REST becomes a viable fallback path for the WebSocket cold-start snapshot - a future client can hydrate the same field set the WebSocket would, if WebSocket connect fails.
- `apps/web/src/api/openapi-spec.json` regenerates with new `VesselDimensions` and `VesselKalmanState` schema components; Orval emits matching schema classes on the next `pnpm apigen`.
- The Prisma nested `select` performs a single round trip per `listVessels` call (already the case), now reading wider columns - cost is negligible at the workload scale we target.

## Flow

See `0016-vessel-summary-shape.d2` for the data flow from Prisma columns through the service mapper into the REST response and the regenerated typed client.
