# ADR-0005: Prisma client generation runs during install

- Status: Accepted
- Date: 2026-05-08

## Context

Prisma is a schema-driven ORM. The TypeScript types for `PrismaClient` are not shipped inside the `@prisma/client` npm package; they are generated from `apps/api/prisma/schema.prisma` by running `prisma generate`. The published package is a thin re-export that points at the generated path. Without that generated path on disk, `import { PrismaClient } from '@prisma/client'` resolves to nothing and downstream typecheck plus typed-eslint rules fail.

CI starts from a clean working directory: `git clone` then `pnpm install --frozen-lockfile`. Without an explicit generation step, the client never lands in `node_modules` on CI, even though it is present on a developer machine after the first `db:migrate` or `db:seed` run.

## Decision

`apps/api/package.json` declares `"postinstall": "prisma generate"`. Every `pnpm install`, on any machine, runs the generator after dependency resolution finishes. Output is written into the workspace `node_modules` tree so that `import { PrismaClient } from '@prisma/client'` resolves correctly across local, CI, and container environments.

## Pipeline

```mermaid
flowchart LR
    A[apps/api/prisma/schema.prisma] --> B[prisma generate]
    B --> C[node_modules/.pnpm/@prisma+client.../.prisma/client/]
    C --> D["import { PrismaClient } from '@prisma/client'"]
    D --> E[tsc, eslint typed rules, runtime]
```

## Tradeoffs

- Each `pnpm install` adds about three seconds for generation. Acceptable in exchange for the deterministic guarantee that the client is present on every machine that has installed dependencies.
- The dependency on a build-time generation step is visible in `package.json` rather than implicit in workflow YAML. Reviewers see the contract directly in the package that owns the schema.
- A broken schema fails the install. Preferable to a delayed failure later in the typecheck or runtime layer.
- The generation is idempotent: re-running on an already-generated client is a small constant cost.

## Alternatives considered

- Explicit `prisma generate` step inside each CI workflow. Rejected because it diverges local and CI: a fresh clone passes install but fails typecheck locally until the developer runs the generator manually. The divergence breeds "works on CI, fails locally" reports.
- Relying on the dependency's own install hooks via pnpm's trusted-builds list. Rejected as fragile across major versions; ownership of generation belongs in the package that owns the schema.

## Evolution

- Migrate the deprecated `package.json#prisma` configuration block to `prisma.config.ts` when adopting Prisma 7. The postinstall script itself does not change.
- If the API package grows additional schema-driven codegen (REST client from OpenAPI, WebSocket frame schemas), consolidate the steps into a single workspace-level `codegen` lifecycle and supersede this ADR.
- The CI workflows in `.github/workflows/lint.yml` and `.github/workflows/typecheck.yml` rely on `pnpm install --frozen-lockfile` invoking this postinstall. No workflow change is required.
