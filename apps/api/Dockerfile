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
# then generate the Prisma client, patch the local TypeScript module
# so the typia + @nestia/core AST transformers run during the api
# compile, then build the api. The install above used
# --ignore-scripts so our postinstall (which calls ts-patch install)
# was skipped; explicitly running it here ensures `nest build` sees
# the patched tsc and emits @TypedRoute decorated routes with the
# nestia transformer applied. Without this, compiled controllers
# throw NoTransformConfigurationError at app startup.
RUN pnpm --filter @sps/shared build \
  && pnpm --filter @sps/api exec prisma generate \
  && pnpm --filter @sps/api exec ts-patch install \
  && pnpm --filter @sps/api build

# pnpm deploy creates a self contained production deployment for the
# api: workspace symlinks resolved to real folders, only production
# dependencies present, no dev tooling. Output lands in /prod which
# the runtime stage then copies verbatim.
#
# After deploy, regenerate the Prisma client INSIDE /prod. The build
# stage's `prisma generate` writes into /repo's pnpm virtual store,
# but pnpm deploy rebuilds /prod's node_modules from the pnpm-store
# (which never saw the generated artefacts), so the runtime stage
# would otherwise see the @prisma/client stub and throw
# "did not initialize yet".
RUN pnpm --filter @sps/api deploy --prod /prod \
  && cp -R apps/api/dist /prod/dist \
  && (cd /prod && ./node_modules/.bin/prisma generate)

FROM node:22-alpine AS runtime
# Pull Alpine security fixes in the runtime stage too. tini handles
# PID 1 duties; openssl is required by the Prisma client at runtime;
# tailscale + ca-certificates power the userspace tailnet join that
# the docker-entrypoint script performs before exec-ing the app.
RUN corepack enable \
  && apk upgrade --no-cache \
  && apk add --no-cache openssl tini tailscale ca-certificates
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=384

COPY --from=build --chown=node:node /prod /app
COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Note on USER directive: deliberately runs as root.
# tailscaled needs write access to /var/lib/tailscale (persistent Fly
# volume) for its state file; the volume is owned by root by default
# and node:node cannot chown it back from inside the container. Running
# the whole stack as root keeps the entrypoint simple and avoids the
# gosu / su-exec dance. Container isolation (Fly machine sandbox + no
# host bind mounts + Tailscale userspace networking) bounds the blast
# radius if Node is compromised.

EXPOSE 3000

# start-period mirrors fly.toml grace_period - cold boot through
# tailscale + cert + nest takes ~30 s on Fly's shared 1-vCPU machine
# (prisma migrate moved to fly.toml [deploy].release_command and no
# longer runs in the boot path). 60 s is 2x that floor; Fly itself
# clamps the corresponding http_service.checks.grace_period to 60 s
# so keeping them aligned avoids docker-side criticals firing while
# fly-side checks are still patient.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# tini owns PID 1; docker-entrypoint.sh sets up certs + tailnet before
# exec-ing the upstream CMD. Both run before the Node app starts so
# /tmp/certs and the tailnet interface are in place when Nest boots.
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
