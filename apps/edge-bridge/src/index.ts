import { readFileSync } from 'node:fs';
import { loadConfig, parseBackendUrls } from './config.js';
import { createLogger } from './logger.js';
import { UdpListener } from './udp-listener.js';
import { SystemdNotify } from './watchdog.js';
import { WssClientPool } from './wss-client-pool.js';
import type { TlsClientCredentials } from './wss-client.js';

const log = createLogger('main');

function loadTlsCredentials(
  certPath: string | undefined,
  keyPath: string | undefined,
  caPath: string | undefined,
): TlsClientCredentials | undefined {
  if (!certPath || !keyPath || !caPath) return undefined;
  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
    ca: readFileSync(caPath),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const notify = new SystemdNotify();
  const tls = loadTlsCredentials(
    config.EDGE_BRIDGE_CLIENT_CERT_PATH,
    config.EDGE_BRIDGE_CLIENT_KEY_PATH,
    config.EDGE_BRIDGE_CA_CERT_PATH,
  );

  const backendUrls = parseBackendUrls(config.EDGE_BRIDGE_BACKEND_URL);
  if (backendUrls.length === 0) {
    throw new Error('EDGE_BRIDGE_BACKEND_URL parsed to an empty list - check repo-root .env');
  }

  log.info('boot', {
    backends: backendUrls,
    udp: `${config.EDGE_BRIDGE_LOCAL_UDP_HOST}:${config.EDGE_BRIDGE_LOCAL_UDP_PORT}`,
    mTLS: tls ? 'configured' : 'disabled',
    systemdNotify: notify.isEnabled() ? 'enabled' : 'disabled',
  });

  const listener = new UdpListener(
    config.EDGE_BRIDGE_LOCAL_UDP_HOST,
    config.EDGE_BRIDGE_LOCAL_UDP_PORT,
  );
  const pool = new WssClientPool({
    urls: backendUrls,
    initialBackoffMs: config.EDGE_BRIDGE_RECONNECT_INITIAL_MS,
    maxBackoffMs: config.EDGE_BRIDGE_RECONNECT_MAX_MS,
    reconnectJitterMs: config.EDGE_BRIDGE_RECONNECT_JITTER_MS,
    connectionTimeoutMs: config.EDGE_BRIDGE_CONNECTION_TIMEOUT_MS,
    sendQueueLimit: config.EDGE_BRIDGE_SEND_QUEUE_LIMIT,
    backpressureWarnBytes: config.EDGE_BRIDGE_BACKPRESSURE_WARN_BYTES,
    shutdownGraceMs: config.EDGE_BRIDGE_SHUTDOWN_GRACE_MS,
    ...(tls ? { tls } : {}),
  });

  listener.on('frame', frameEvent => {
    log.debug('frame received', {
      length: frameEvent.frame.length,
      from: `${frameEvent.remoteAddress}:${frameEvent.remotePort}`,
    });
    pool.send(frameEvent.frame);
  });
  listener.on('error', err => {
    log.error('listener error, exiting', { error: err.message });
    process.exit(1);
  });

  await listener.start();
  pool.start();
  notify.ready();
  notify.status(
    `listener on ${config.EDGE_BRIDGE_LOCAL_UDP_HOST}:${config.EDGE_BRIDGE_LOCAL_UDP_PORT}, backends [${backendUrls.join(', ')}]`,
  );
  notify.startWatchdog();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutdown signal', { signal });
    notify.stopping();
    notify.stopWatchdog();
    // Stop the UDP listener first so no new AIS frames arrive at the
    // pool after the WSS sinks start tearing down. The reverse order
    // would let inbound frames land in each per-sink queue after
    // shutdownRequested = true was set on the clients, and the queue
    // would never drain - frames lost silently on every restart.
    await listener.stop();
    await pool.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('fatal', { error: message });
  process.exit(1);
});
