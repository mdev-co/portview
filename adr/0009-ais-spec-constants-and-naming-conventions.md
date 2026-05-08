# ADR-0009: AIS spec constants and naming conventions

- Status: Accepted
- Date: 2026-05-09

## Context

After D5 closed, four modules each carried their own copies of ITU-R M.1371-5 spec defaults: the bit-level parsers in `@sps/shared/src/parsers/*`, the GIGO validators, the AisStream JSON adapter (`apps/api/src/ingest/adapters/ais-stream.adapter.ts`), and the frame builder (`apps/api/src/telemetry-ws/frame-builder.ts`). The duplication was small in each site (one or two literals per file) but the surface was large enough that a future spec revision or a fourth module would have to hunt the defaults across the tree to keep them aligned.

The same audit surfaced two unrelated naming gaps. The MMSI-MID extraction in the frame builder used a bare `Math.floor(mmsi / 1_000_000)` divisor without a name; the source-implementation files used `*.source.ts` without the convention being recorded anywhere a maintainer could find it.

## Decision

**1. AIS spec constants live in `packages/shared/src/types/ais-spec.ts`.** Every default and sentinel the pipeline needs is named, cited to the relevant ITU-R section in the file's header comment, and re-exported from the shared barrel. The four modules now import from one source of truth. The constants cover navigational status defaults, repeat / maneuver / radio / shipType / EPFD / AIS-version defaults, MMSI MID divisor and region bounds, rate-of-turn sentinel and out-of-range bound, SOG / COG / heading / latitude / longitude unknown sentinels, and the `SUPPORTED_AIS_MESSAGE_TYPES` literal tuple.

**2. Module suffix convention is recorded.** Files that implement a domain role carry the role as a suffix:

- `*.source.ts` — implementations of `ISource` (transport adapter for inbound frames).
- `*.adapter.ts` — payload-format adapters between an upstream JSON shape and the internal `AisMessage` discriminated union.
- `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.gateway.ts` — NestJS-managed roles in `apps/api`.
- `*.codec.ts` — fixed-width binary serialisers (offset-table + encode/decode pair).
- `*.spec.ts` — unit tests next to the unit they cover.

The suffix is grep-friendly (`*.source.ts` enumerates every transport implementation) and aligns the codebase with the surrounding NestJS conventions in `apps/api`.

**3. Cosmetic consistency.** Single-letter loop variables (`l` for listener, `n` for numeric) are replaced with their unabbreviated forms. The frame-builder switch cases share a `base` object spread to make the per-message-type differences explicit without the boilerplate.

## Tradeoffs

- Centralising the spec constants adds one import line at four call sites and lets us audit spec compliance from one file. Worth it: the alternative is a "find references" pass through five files every time the spec is questioned.
- The `*.source.ts` suffix convention is a code-organisation contract. Every new transport must follow it; the cost is a small naming discipline, the benefit is that a new contributor can `find apps/api -name '*.source.ts'` and see the entire transport surface.
- The shared module is now the canonical reference for "what an AIS field's unknown sentinel looks like". A future bug where a parser disagrees with a validator is a one-file fix, not a cross-module reconciliation.

## Alternatives considered

- **Per-module constants.** Status quo before this ADR. Rejected: drift across four modules has already produced one off-by-one bug in similar codebases (see ADR-0006 on data integrity).
- **A separate `@sps/ais` package for spec.** Rejected: the constants are 50 LOC of literals; a separate package adds workspace plumbing without splitting along a real boundary. They live next to other shared types in `@sps/shared/types/`.
- **Runtime validation (Zod) at the adapter using these constants.** Rejected per project anti-pattern 6: Zod is not used over Orval-typed responses or upstream JSON we already own a destination type for.
