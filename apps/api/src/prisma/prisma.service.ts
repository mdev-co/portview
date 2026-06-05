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
