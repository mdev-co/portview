/**
 * Single read of every environment variable the api uses, with typed
 * defaults and boolean helpers. Lives in one place so:
 *
 *  - the literal env-var names are never sprinkled across the
 *    codebase (typos go unnoticed there forever),
 *  - opt-in / opt-out toggles read consistently (any non-trivial env
 *    parsing rule applies the same way wherever the toggle is used),
 *  - tests can swap a stub via direct re-import of the helpers.
 *
 * Add new env access here, never inline `process.env.FOO` in app
 * code.
 */

const NODE_ENV = 'NODE_ENV';
const PORT = 'PORT';
const DATABASE_URL = 'DATABASE_URL';
const CORS_ALLOWED_ORIGINS = 'CORS_ALLOWED_ORIGINS';
const EXTERNAL_FEED_TOKEN = 'EXTERNAL_FEED_TOKEN';
const EXTERNAL_FEED_ENDPOINT = 'EXTERNAL_FEED_ENDPOINT';
const SPS_EXPOSE_OPENAPI = 'SPS_EXPOSE_OPENAPI';
const EDGE_INGEST_PORT = 'EDGE_INGEST_PORT';
const EDGE_INGEST_SERVER_CERT_PATH = 'EDGE_INGEST_SERVER_CERT_PATH';
const EDGE_INGEST_SERVER_KEY_PATH = 'EDGE_INGEST_SERVER_KEY_PATH';
const EDGE_INGEST_CA_CERT_PATH = 'EDGE_INGEST_CA_CERT_PATH';
const EDGE_INGEST_ALLOWED_CNS = 'EDGE_INGEST_ALLOWED_CNS';

const PRODUCTION_ENV = 'production';
const TRUTHY = 'true';

const DEFAULT_PORT = 3000;
const DEFAULT_EDGE_INGEST_PORT = 8443;

export function isProduction(): boolean {
  return process.env[NODE_ENV] === PRODUCTION_ENV;
}

/**
 * OpenAPI surface (Swagger UI + /api/docs-json) is gated by TWO
 * conditions, both must be true:
 *
 *  1. NODE_ENV must NOT be production. Even if the env-var below is
 *     accidentally left on in a prod deploy, this catches it.
 *  2. SPS_EXPOSE_OPENAPI must be explicitly set to 'true'. Default
 *     is closed. Developers opt in per machine; CI / prod never
 *     accidentally expose the spec.
 */
export function shouldExposeOpenApi(): boolean {
  if (isProduction()) return false;
  return process.env[SPS_EXPOSE_OPENAPI] === TRUTHY;
}

export function getPort(): number {
  const raw = process.env[PORT];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function getCorsAllowedOrigins(): string[] {
  const raw = process.env[CORS_ALLOWED_ORIGINS] ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export type EdgeIngestConfig = {
  readonly port: number;
  readonly serverCertPath: string;
  readonly serverKeyPath: string;
  readonly caCertPath: string;
  readonly allowedCns: readonly string[];
};

/**
 * Edge-ingest configuration. Returns null when any required variable
 * is absent or empty - the api boots without the mTLS listener in
 * that case so local development and tests do not need cert files
 * staged. When configured, every field is present and non-empty.
 */
export function getEdgeIngestConfig(): EdgeIngestConfig | null {
  const serverCertPath = process.env[EDGE_INGEST_SERVER_CERT_PATH]?.trim();
  const serverKeyPath = process.env[EDGE_INGEST_SERVER_KEY_PATH]?.trim();
  const caCertPath = process.env[EDGE_INGEST_CA_CERT_PATH]?.trim();
  const allowedCnsRaw = process.env[EDGE_INGEST_ALLOWED_CNS]?.trim();
  if (!serverCertPath || !serverKeyPath || !caCertPath || !allowedCnsRaw) {
    return null;
  }
  const allowedCns = allowedCnsRaw
    .split(',')
    .map((cn) => cn.trim())
    .filter((cn) => cn.length > 0);
  if (allowedCns.length === 0) return null;
  const rawPort = process.env[EDGE_INGEST_PORT];
  const parsedPort = rawPort ? Number(rawPort) : DEFAULT_EDGE_INGEST_PORT;
  const port =
    Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : DEFAULT_EDGE_INGEST_PORT;
  return { port, serverCertPath, serverKeyPath, caCertPath, allowedCns };
}

export const ENV_KEYS = {
  NODE_ENV,
  PORT,
  DATABASE_URL,
  CORS_ALLOWED_ORIGINS,
  EXTERNAL_FEED_TOKEN,
  EXTERNAL_FEED_ENDPOINT,
  SPS_EXPOSE_OPENAPI,
  EDGE_INGEST_PORT,
  EDGE_INGEST_SERVER_CERT_PATH,
  EDGE_INGEST_SERVER_KEY_PATH,
  EDGE_INGEST_CA_CERT_PATH,
  EDGE_INGEST_ALLOWED_CNS,
} as const;
