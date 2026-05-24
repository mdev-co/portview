import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { UdpListener } from './udp-listener.js';
import { type TlsClientCredentials, WssClient } from './wss-client.js';

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
  const tls = loadTlsCredentials(
    config.EDGE_BRIDGE_CLIENT_CERT_PATH,
    config.EDGE_BRIDGE_CLIENT_KEY_PATH,
    config.EDGE_BRIDGE_CA_CERT_PATH,
  );

  log.info('boot', {
    backend: config.EDGE_BRIDGE_BACKEND_URL,
    udp: `${config.EDGE_BRIDGE_LOCAL_UDP_HOST}:${config.EDGE_BRIDGE_LOCAL_UDP_PORT}`,
    mTLS: tls ? 'configured' : 'disabled',
  });

  const listener = new UdpListener(
    config.EDGE_BRIDGE_LOCAL_UDP_HOST,
    config.EDGE_BRIDGE_LOCAL_UDP_PORT,
  );
  const client = new WssClient({
    url: config.EDGE_BRIDGE_BACKEND_URL,
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
    client.send(frameEvent.frame);
  });
  listener.on('error', err => {
    log.error('listener error, exiting', { error: err.message });
    process.exit(1);
  });

  await listener.start();
  client.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutdown signal', { signal });
    await client.stop();
    await listener.stop();
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
