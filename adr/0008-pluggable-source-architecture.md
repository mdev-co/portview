# ADR-0008: Pluggable source and adapter architecture

- Status: Accepted
- Date: 2026-05-08

## Context

D5 closes with three live ingest sources behind one priority FSM: a local UDP NMEA listener, a WebSDR placeholder, and an AisStream WebSocket subscriber. Each delivers raw bytes in a different transport (UDP datagrams, WS text frames, WS JSON envelopes) and a different format (NMEA 0183 sentences, AisStream JSON wrapping ITU-R M.1371 fields).

A natural temptation at this point is to fold the JSON parsing into the AisStream source itself, keep the NMEA decode close to the UDP listener, and let each source emit `AisMessage` directly. That would inline transport, codec and validation per source and produce the shortest possible code path per format.

We rejected that direction. The number of formats grows — LoRaWAN sensors, Class B Aton beacons, satellite AIS feeds, custom drone telemetry — and the cost of inlining is paid every time. More importantly, the failure surface of "decode + validate + DLQ" must stay uniform: every dropped frame must produce the same DLQ row shape, every accepted frame must traverse the same `validateAisMessage` boundary, and the FSM must count rejections by the same vocabulary regardless of where the frame came from.

## Decision

The ingest pipeline is built around two extension points and one common spine.

**1. `ISource` interface (`packages/shared/src/machines/ingest-source.types.ts`).** A source produces opaque `NmeaFrame { raw, receivedAt, sourceId }` records on `onFrame`. It does not parse. It does not validate. It connects, listens, and emits raw bytes (NMEA strings or JSON envelopes — the spine inspects the leading character to dispatch). Local UDP, WebSDR and AisStream all implement `ISource`. A future LoRa source implements the same interface.

**2. Adapter modules (`apps/api/src/ingest/adapters/`).** A boundary adapter takes a raw payload string from a non-NMEA source and returns either a typed `AisMessage` or a structured rejection. The first adapter in tree is `ais-stream.adapter.ts`. A future LoRa or AISHub adapter sits next to it. NMEA sources skip the adapter and go through the existing bit-level `Decoder`.

**3. Common spine in `IngestService.attachSource`.** Three branches: NMEA frames go through the GIGO `Decoder`, JSON frames go through the matching adapter, anything else hits the DLQ as `parse-error`. All three branches converge on the same `validateAisMessage` boundary, the same `publishVesselUpdate` call, the same FSM events. The spine is format-agnostic by construction; new formats are added by wiring a new branch and a new adapter, never by editing the spine's accepted shape.

The wire format the gateway broadcasts (`VesselUpdateFrame`, 40 bytes, fixed offsets) is also format-agnostic at the FE: the FE consumes one binary schema regardless of which source produced the original frame. The `sourceId` byte makes the origin observable but does not affect rendering.

## Tradeoffs

- Two extension points (Source + Adapter) cost more upfront than one inlined-per-source path. The price is paid once and amortised over every additional format. With three sources today and at least two more on the roadmap (LoRa, satellite AIS), the break-even is already past.
- A new format requires three artefacts: a `Source` for transport, an `Adapter` for payload-to-domain mapping, and an entry in `FrameRejectionReason` for any new structural rejection kinds it can produce. The boundary is explicit but it is also wider than a one-shot grep-and-edit.
- The spine inspects the first byte to dispatch (`{` = JSON, `$`/`!` = NMEA, else DLQ). This is sufficient for the formats we ingest today; if a future format starts with a printable letter we'll switch to per-source format declaration on `ISource` rather than first-byte sniffing.
- The wire schema (40 B fixed) is shared across all sources today. A future format with extra fields (e.g. air vehicles with altitude) needs either a schema-version byte at offset 0 or a separate codec. We deliberately did not add the version byte yet — the cost of a coordinated FE+BE bump when it becomes necessary is lower than the cost of carrying an unused byte forever.

## Alternatives considered

- **One source per format with inlined parsing and validation.** Rejected on the grounds above: the GIGO boundary, the DLQ shape and the FSM rejection vocabulary must stay uniform across sources, and inlining each one duplicates that uniformity in three places.
- **Single adapter dispatching by source id.** Rejected: it couples the adapter to the FSM source vocabulary and forces a switch statement that grows with every format. Per-format adapter modules keep the unit testable in isolation.
- **Zod-validated boundary at the adapter.** Rejected for the same reason Zod is not used over Orval-typed responses (CLAUDE.md anti-pattern 6): we already own the AIS schema and the parsers; adding Zod over them is duplicate validation. Adapters return discriminated rejections by hand and are unit-tested against the upstream schema.
