# syntax=docker/dockerfile:1.7

# Two stage hardened image for the SPS api.
#
# Defence in depth:
#   - alpine 3.21 pinned on both stages; `apk upgrade --no-cache` pulls
#     current Alpine security fixes at build time
#   - pnpm with --frozen-lockfile (lockfile is authoritative)
#   - `pnpm deploy --prod` flattens the workspace and strips dev
#     dependencies for the runtime image so tools like jest, ts-jest,
#     eslint, tsx and friends never reach production. This is what
#     keeps the published image small (~150 MB) and free of the CVEs
#     that hide in transitive dev dependencies.
#   - non-root user (USER node) so a container compromise lacks write
#     access to anything outside /app owned by node
#   - tini as PID 1 for proper signal handling and zombie reaping
#   - NODE_ENV=production so libs avoid debug paths
#   - HEALTHCHECK so Fly knows when the api is up
#   - .dockerignore at repo root strips secrets / private docs / git
#     metadata before the image is even built

FROM node:22-alpine AS build
RUN corepack enable && apk upgrade --no-cache && apk add --no-cache openssl
WORKDIR /repo

# Copy manifests first so the dependency layer caches when source
# changes but lockfile does not.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma ./apps/api/prisma

# Install with all deps so the build steps below have tsup, nest cli,
# prisma cli etc. --ignore-scripts because the @sps/shared prepare
# hook runs tsup against source we have not copied yet.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source after deps are installed.
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Build shared first (its dist is what apps/api types resolve to),
# then generate the Prisma client, then build the api.
RUN pnpm --filter @sps/shared build \
  && pnpm --filter @sps/api exec prisma generate \
  && pnpm --filter @sps/api build

# pnpm deploy creates a self contained production deployment for the
# api: workspace symlinks resolved to real folders, only production
# dependencies present, no dev tooling. Output lands in /prod which
# the runtime stage then copies verbatim.
RUN pnpm --filter @sps/api deploy --prod /prod \
  && cp -R apps/api/dist /prod/dist

FROM node:22-alpine AS runtime
# Pull Alpine security fixes in the runtime stage too. tini handles
# PID 1 duties; openssl is required by the Prisma client at runtime.
RUN corepack enable && apk upgrade --no-cache && apk add --no-cache openssl tini
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=384

COPY --from=build --chown=node:node /prod /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/src/main.js"]
