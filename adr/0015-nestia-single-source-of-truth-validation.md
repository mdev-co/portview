# ADR 0015 - @nestia/core as single source of truth for boundary validation and OpenAPI

- Status: accepted
- Date: 2026-05-12

## Context

The first public endpoint (`/api/vessels`) landed with two parallel descriptions of the same data: Zod schemas for input validation at the HTTP boundary, and `@ApiProperty`-decorated classes for OpenAPI schema generation consumed by `@nestjs/swagger`. Adding one field to a vessel required editing the TypeScript type, the Zod schema, the decorator class, and example constants. Drift between any of these is a runtime bug class the compiler cannot catch.

A separate concern: the `safeParse` boundary adapter that translated Zod errors into HTTP 400 was a hand-rolled bridge that the next endpoint would need to copy.

## Decision

Adopt `@nestia/core` so that a single TypeScript type drives both runtime validation and OpenAPI schema generation. Controller decorators move from `@Get` / `@Query` / `@Param` to `@TypedRoute.Get` / `@TypedQuery` / `@TypedParam`. Boundary types live as plain TS declarations with inline constraint annotations (`tags.Type<'int32'>`, `tags.Minimum<N>`, `tags.Maximum<N>`). The OpenAPI spec is dumped to disk by `nestia swagger` and read at runtime by `SwaggerModule.setup` for the docs UI.

## Tradeoffs considered

### Status quo (Zod + @ApiProperty)

Two sources of truth for one wire format. Every field added in three places. `safeParse` adapter copies on every new endpoint. Familiar to any NestJS reader, no transformer in the toolchain, no lock-in. Cost in maintenance and review attention grows linearly with the surface.

### Typia for validation only, keep @nestjs/swagger for schemas

One toolchain addition (the Typia transformer), validation collapses to `typia.assert<T>(...)`. Cleaner than Zod for input. But `@ApiProperty` decorator classes stay, so OpenAPI schemas remain a parallel description maintained by hand. The dual-world problem is renamed, not solved.

### @nestia/core (chosen)

Single source of truth: a plain TypeScript type generates both the runtime validator and the OpenAPI schema at compile time via the transformer. Validation errors return 400 with field-level detail without a hand-rolled adapter. The boundary surface in code is the minimum required to express the contract; no decorator forest, no schema duplication.

Cost: a TypeScript compiler patch (`ts-patch`) and two transformer plugins. Jest config needs the patched compiler. The decorators are nestia-specific, so the lock-in surface is the controller signatures - roughly 6 decorators per endpoint, easy to migrate out if the library is abandoned. The transformer requires full TypeChecker access, which forces `isolatedModules: false` inside the Jest config (the rest of the build is unaffected).

## Consequences

- The schema in the spec and the validator at the boundary cannot drift, because both emit from the same TS declaration on every `tsc` invocation.
- Adding a field to a vessel is a one-line edit to the type. The OpenAPI spec, the Typia validator, and the generated web client all follow on the next dump + Orval run.
- `@nestjs/swagger` remains a runtime dependency for the `/api/docs` UI middleware only - `@ApiProperty`, `@ApiTags`, `DocumentBuilder` are gone. Zod and `nestjs-zod` are removed from `apps/api`.
- The `openapi:dump` npm script now wraps `nestia swagger` and pipes the output through Prettier so the committed spec stays format-clean. The pre-commit OpenAPI sync hook continues to work unchanged.
- Boundary unit tests that exercised the Zod coercion path are removed; the equivalent coverage moves to an HTTP-level test via supertest in a follow-up.

## Flow

See `0015-nestia-flow.d2` for the toolchain and data flow diagram (render the D2 source to an SVG or PNG locally; GitHub does not render D2 natively).
