import { loadConfig } from './config.js';

/**
 * Edge-bridge boot. Chunk 1 scaffold only: loads the config, logs the
 * resolved target, exits cleanly. Chunk 2 replaces this with the UDP
 * listener + WSS client + exponential backoff reconnect.
 */
function main(): void {
  const config = loadConfig();
  const certsConfigured =
    config.EDGE_BRIDGE_CLIENT_CERT_PATH !== undefined &&
    config.EDGE_BRIDGE_CLIENT_KEY_PATH !== undefined &&
    config.EDGE_BRIDGE_CA_CERT_PATH !== undefined;
  process.stdout.write(
    `[edge-bridge] boot: backend=${config.EDGE_BRIDGE_BACKEND_URL} ` +
      `udp=${config.EDGE_BRIDGE_LOCAL_UDP_HOST}:${config.EDGE_BRIDGE_LOCAL_UDP_PORT} ` +
      `mTLS=${certsConfigured ? 'configured' : 'pending (chunk 3)'}\n`,
  );
}

main();
