import 'dotenv/config';
import { z } from 'zod';

/**
 * Edge-bridge runtime configuration sourced from the repo-root `.env`.
 *
 * Defaults cover the chunk 1 scaffold path so `pnpm dev` boots without
 * any env file present. Chunk 3 will tighten the certificate paths from
 * optional to required once the mTLS infrastructure is in place; until
 * then the bridge can boot in a degraded "config-loaded-but-no-cert"
 * mode that logs the intended target and exits cleanly.
 *
 * Read-once: the schema is parsed at boot, never re-read at runtime.
 * Mutating env after boot does not change behaviour.
 */
const EnvSchema = z.object({
  EDGE_BRIDGE_BACKEND_URL: z
    .string()
    .url()
    .default('wss://localhost:8443/edge-ingest')
    .describe('WSS endpoint of the apps/api EdgeIngestGateway (chunk 3).'),
  EDGE_BRIDGE_LOCAL_UDP_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(10110)
    .describe('UDP port where rtl_ais writes NMEA (matches rtl_ais default 10110).'),
  EDGE_BRIDGE_LOCAL_UDP_HOST: z
    .string()
    .default('127.0.0.1')
    .describe('UDP bind host on the Pi; loopback because rtl_ais ships to localhost.'),
  EDGE_BRIDGE_CLIENT_CERT_PATH: z
    .string()
    .optional()
    .describe('Path to the per-device client certificate (PEM). Required from chunk 3 onward.'),
  EDGE_BRIDGE_CLIENT_KEY_PATH: z
    .string()
    .optional()
    .describe('Path to the per-device client private key (PEM). Required from chunk 3 onward.'),
  EDGE_BRIDGE_CA_CERT_PATH: z
    .string()
    .optional()
    .describe(
      'Path to the CA certificate (PEM) that signed the backend server cert. ' +
        'Required from chunk 3 onward so the bridge verifies the backend identity.',
    ),
});

export type EdgeBridgeConfig = z.infer<typeof EnvSchema>;

export function loadConfig(): EdgeBridgeConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.format();
    throw new Error(
      `Invalid edge-bridge configuration: ${JSON.stringify(formatted, null, 2)}\n` +
        'Check repo-root .env against .env.example.',
    );
  }
  return parsed.data;
}
