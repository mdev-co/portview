import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Default Prisma connection pool size if DATABASE_URL does not pin
 * one explicitly. Prisma's own default is num_cpus * 2 + 1, which on
 * Fly's shared-1-vCPU machine resolves to THREE. AIS ingest from the
 * Pi feeds the persistence service tens of upserts per second and
 * three connections starve the pool within seconds, surfacing as a
 * cascade of `Timed out fetching a new connection from the
 * connection pool` errors and stalling the WS gateway long enough to
 * trip Fly's health check (warning -> load balancer returns 503).
 *
 * Ten connections covers the observed ingest rate with headroom for
 * REST queries; the underlying Postgres permits the larger pool
 * comfortably.
 */
const DEFAULT_POOL_CONNECTION_LIMIT = 10;
/** Seconds Prisma will wait before declaring pool acquisition timed out. */
const DEFAULT_POOL_TIMEOUT_SEC = 20;

/**
 * Server-side statement timeout (ms). Any client-side connection that
 * holds a transaction or query for longer than this is killed by the
 * Postgres backend with a `canceling statement due to statement
 * timeout` error. The point is NOT performance - it is safety against
 * the failure mode observed during the 2026-06-08 incident, where a
 * cascade of restarts left 18 client backends in `idle in transaction`
 * holding row locks on the `vessels` table for ~1.7 hours, blocking
 * every subsequent Prisma persist. With the timeout in place, the
 * Postgres backend reaps stale sessions automatically and no manual
 * `pg_terminate_backend` ever has to run again. 30 s is far longer
 * than any legitimate query in this codebase (snapshot build ~50 ms,
 * upserts ~5 ms) so genuine work is never interrupted.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new Error('DATABASE_URL is not set; check repo root .env');
    }
    super({ datasources: { db: { url: withPoolDefaults(raw) } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Apply server-side statement timeout to every connection in the
    // pool. Prisma keeps connections warm and reuses them, so SETs
    // applied here propagate to subsequent queries until the connection
    // is recycled by Postgres or the client disconnects. Done at module
    // init rather than on every query so the cost is paid once.
    await this.$executeRawUnsafe(
      `SET statement_timeout = ${DEFAULT_STATEMENT_TIMEOUT_MS}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Append `connection_limit` and `pool_timeout` query params to the
 * DATABASE_URL when not already pinned, preserving any other params
 * an operator may have set (e.g. `sslmode`, `schema`). Out-of-band
 * URL tuning still wins because we only set defaults if missing.
 */
function withPoolDefaults(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set(
      'connection_limit',
      String(DEFAULT_POOL_CONNECTION_LIMIT),
    );
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(DEFAULT_POOL_TIMEOUT_SEC));
  }
  return url.toString();
}
