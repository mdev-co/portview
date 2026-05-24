import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { UdpListener } from './udp-listener.js';
import { WssClient } from './wss-client.js';

const log = createLogger('main');

/**
 * Edge-bridge boot. Wires the local UDP listener (chunk 2) to the WSS
 * client (chunk 2). mTLS certificate loading hooks into the client in
 * chunk 3; this build connects over plain ws until the backend gateway
 * lands.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const mTlsConfigured =
    config.EDGE_BRIDGE_CLIENT_CERT_PATH !== undefined &&
    config.EDGE_BRIDGE_CLIENT_KEY_PATH !== undefined &&
    config.EDGE_BRIDGE_CA_CERT_PATH !== undefined;

  log.info('boot', {
    backend: config.EDGE_BRIDGE_BACKEND_URL,
    udp: `${config.EDGE_BRIDGE_LOCAL_UDP_HOST}:${config.EDGE_BRIDGE_LOCAL_UDP_PORT}`,
    mTLS: mTlsConfigured ? 'configured' : 'pending (chunk 3)',
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
