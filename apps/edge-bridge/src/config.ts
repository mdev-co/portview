import 'dotenv/config';
import { z } from 'zod';

/**
 * Edge-bridge runtime configuration sourced from the repo-root `.env`.
 *
 * Defaults cover the local-development path so `pnpm dev` boots without
 * any env file present. Chunk 3 will tighten the certificate paths from
 * optional to required once the mTLS infrastructure is in place; until
 * then the bridge can boot in a degraded "config-loaded-but-no-cert"
 * mode that logs the intended target and connects over plain ws.
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
    .describe(
      'Path to the per-device client certificate (PEM). When set together ' +
        'with the key and CA paths the bridge connects over mTLS; missing ' +
        'any of the three falls back to plain ws for local dev.',
    ),
  EDGE_BRIDGE_CLIENT_KEY_PATH: z
    .string()
    .optional()
    .describe('Path to the per-device client private key (PEM).'),
  EDGE_BRIDGE_CA_CERT_PATH: z
    .string()
    .optional()
    .describe('Path to the CA certificate (PEM) that signed the backend server cert.'),
  EDGE_BRIDGE_RECONNECT_INITIAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(1000)
    .describe('Initial reconnect delay for WSS exponential backoff (default 1 s).'),
  EDGE_BRIDGE_RECONNECT_MAX_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(30000)
    .describe('Cap for the exponential backoff reconnect delay (default 30 s).'),
  EDGE_BRIDGE_RECONNECT_JITTER_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(1000)
    .describe(
      'Random delay added to every reconnect attempt (uniform in [0, ms]). ' +
        'Prevents thundering-herd when many bridges reconnect simultaneously.',
    ),
  EDGE_BRIDGE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .default(5000)
    .describe(
      'Time the WSS client waits for handshake completion before forcing ' +
        'close. Without this a half-open TCP can wedge the connect attempt.',
    ),
  EDGE_BRIDGE_BACKPRESSURE_WARN_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(65536)
    .describe(
      'Threshold (bytes) over which WSS buffered amount triggers a warning. ' +
        'On the Raspberry Pi 1 GB sustained backpressure is the leading OOM cause; ' +
        'default 64 KB surfaces it early without flooding journalctl.',
    ),
  EDGE_BRIDGE_SEND_QUEUE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(1000)
    .describe(
      'Maximum number of frames buffered while WSS is disconnected ' +
        'before the client starts dropping oldest-first.',
    ),
  EDGE_BRIDGE_SHUTDOWN_GRACE_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(5000)
    .describe(
      'Time budget (ms) to drain the in-memory queue after SIGTERM ' +
        'before forcing the close handshake.',
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
