# ADR 0014 - Fly.io deploy architecture for api and PostGIS database

- Status: accepted
- Date: 2026-05-11

## Context

The api needs a public production deploy on a small monthly budget, with a Postgres database that supports the PostGIS extension for geographic queries. The stack is NestJS 11 + Prisma 6 + Postgres 17, with spatial columns (`geography(Point, 4326)`) and `ST_DWithin` queries in the persistence layer.

The deploy host (Fly.io) offers three Postgres paths:

1. Managed Postgres (`fly mpg`) - official, supported, billed at platform rates.
2. Legacy unmanaged Postgres (`fly postgres create`) - first-party image but a community-maintained product.
3. Bring-your-own Postgres image as a regular Fly app, with a mounted volume for persistence.

PostGIS support is what forces the decision.

## Decision

Deploy the database as a regular Fly app using the upstream `postgis/postgis:17-3.5-alpine` image. Co-locate the api app and the database app in the same region. Connect the api to the database over Fly's internal 6PN private network (`<app>.internal:5432`). Do not expose the database on the public internet.

## Tradeoffs considered

### Managed Postgres

PostGIS availability is undocumented at the moment of writing. Higher monthly cost than the alternatives. Stronger SLA and managed backups, neither of which are required for a portfolio-scale demo.

### Legacy unmanaged Postgres

The stock image does not preinstall the PostGIS extension. Installing it post-boot via `apt` succeeds on a sufficiently large machine, but does not survive machine recreation because the container root filesystem is ephemeral - only mounted volumes persist. The fix would be a custom image, at which point the path collapses into option 3 anyway.

### Custom image + Fly volume (chosen)

The upstream `postgis/postgis` image ships PostGIS preinstalled. Mounting a Fly volume at `/var/lib/postgresql/data` (with `PGDATA` pointing at a subdirectory of the mount) gives durable storage. The api app reads `DATABASE_URL` from a Fly secret pointing at the internal DNS name. No public port exposure. Cost is similar to option 2 and lower than option 1.

Cost of option 3 is the operator's responsibility for backups (manual `pg_dump`) and for any future Postgres upgrades. Both are acceptable for the current scope.

## Consequences

- The database is reachable only from inside the Fly org via 6PN. Public internet has no route to port 5432.
- PostGIS works on first call against the freshly seeded database (`CREATE EXTENSION IF NOT EXISTS postgis` is the first statement in the init migration).
- The build pipeline regenerates the Prisma client inside the production deployment directory after `pnpm deploy --prod`, so the runtime container can initialise the client without falling back to the package stub.
- The api Dockerfile runs as a non-root user with `tini` as PID 1, opens only one port, and pulls Alpine security patches on both build and runtime stages.
- Backups are not automated. A `pg_dump` workflow needs to be scheduled before the database holds anything worth keeping.

## Region

Frankfurt (`fra`). Warsaw (`waw`) was the original target as the closest point of presence to Szczecin but was deprecated by the platform for new resource provisioning in May 2026. Frankfurt is the next-closest accepting region; round-trip latency from the Szczecin area is acceptable for the demo workload.
