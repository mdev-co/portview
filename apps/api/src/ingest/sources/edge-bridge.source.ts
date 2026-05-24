import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import type { Server as HttpsServer } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { Logger } from '@nestjs/common';
import type { ISource, NmeaFrame, SourceStats, Unsubscribe } from '@sps/shared';
import { SourceId } from '@sps/shared';
import { type RawData, WebSocketServer, type WebSocket } from 'ws';

import { TokenBucket } from './token-bucket';

const SOURCE_ID = SourceId.EdgeBridge;
const SOURCE_PRIORITY = 0;
const NMEA_MAX_LENGTH = 82;
const DEFAULT_RATE_LIMIT = 200;
const DEFAULT_PATH = '/edge-ingest';

export type EdgeBridgeSourceOptions = {
  readonly port: number;
  readonly serverCertPath: string;
  readonly serverKeyPath: string;
  readonly caCertPath: string;
  readonly allowedCns: readonly string[];
  readonly rateLimitPerConnection?: number;
  readonly path?: string;
};

type FrameCallback = (frame: NmeaFrame) => void;
type ErrorCallback = (error: Error) => void;

/**
 * mTLS WSS listener that accepts NMEA frames forwarded by apps/edge-bridge
 * instances running on Raspberry Pi units. Implements ISource so frames
 * flow through the same priority FSM, decoder and DLQ as LocalUDP /
 * WebSDR / AISStream feeds.
 *
 * Trust boundary: every TCP connection MUST present a client certificate
 * signed by the CA bundled at caCertPath AND its CN MUST be in
 * allowedCns. Two checks because a valid CA-signed cert from a
 * lower-trust path (e.g. a leaked dev cert) without CN allowlist would
 * be sufficient. Belt and suspenders, no shortcut.
 *
 * Per-connection token bucket because one rogue bridge must not be able
 * to starve other bridges or upstream sources of frame budget.
 */
export class EdgeBridgeSource implements ISource {
  readonly id: SourceId = SOURCE_ID;
  readonly priority = SOURCE_PRIORITY;

  private readonly port: number;
  private readonly path: string;
  private readonly allowedCns: ReadonlySet<string>;
  private readonly rateLimitPerConnection: number;
  private readonly frameListeners = new Set<FrameCallback>();
  private readonly errorListeners = new Set<ErrorCallback>();
  private readonly tlsContext: {
    cert: Buffer;
    key: Buffer;
    ca: Buffer;
  };
  private readonly log = new Logger(EdgeBridgeSource.name);
  private httpsServer: HttpsServer | null = null;
  private wss: WebSocketServer | null = null;
  private framesAccepted = 0;
  private framesRejectedLength = 0;
  private framesRejectedRate = 0;
  private rejectedHandshakes = 0;
  private activeConnections = 0;

  constructor(options: EdgeBridgeSourceOptions) {
    this.port = options.port;
    this.path = options.path ?? DEFAULT_PATH;
    this.allowedCns = new Set(options.allowedCns);
    this.rateLimitPerConnection =
      options.rateLimitPerConnection ?? DEFAULT_RATE_LIMIT;
    this.tlsContext = {
      cert: readFileSync(options.serverCertPath),
      key: readFileSync(options.serverKeyPath),
      ca: readFileSync(options.caCertPath),
    };
  }

  async start(): Promise<void> {
    if (this.httpsServer) return;
    const server = createHttpsServer({
      cert: this.tlsContext.cert,
      key: this.tlsContext.key,
      ca: this.tlsContext.ca,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
    const wss = new WebSocketServer({ server, path: this.path });
    wss.on('connection', (socket, request) => {
      const tlsSocket = request.socket as TLSSocket;
      const cn = extractCn(tlsSocket.getPeerCertificate());
      if (cn === null || !this.allowedCns.has(cn)) {
        this.rejectedHandshakes += 1;
        socket.close(1008, 'cn-not-allowed');
        return;
      }
      this.handleConnection(socket, cn);
    });
    wss.on('error', (err) => {
      this.errorListeners.forEach((listener) => listener(err));
    });

    return new Promise<void>((resolve, reject) => {
      const onListenError = (err: Error): void => {
        server.removeListener('error', onListenError);
        reject(err);
      };
      server.once('error', onListenError);
      server.listen(this.port, () => {
        server.removeListener('error', onListenError);
        server.on('error', (err) => {
          this.errorListeners.forEach((listener) => listener(err));
        });
        this.httpsServer = server;
        this.wss = wss;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const wss = this.wss;
    const server = this.httpsServer;
    this.wss = null;
    this.httpsServer = null;
    if (wss) {
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  onFrame(callback: FrameCallback): Unsubscribe {
    this.frameListeners.add(callback);
    return () => {
      this.frameListeners.delete(callback);
    };
  }

  onError(callback: ErrorCallback): Unsubscribe {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  getStats(): SourceStats {
    return {
      framesAccepted: this.framesAccepted,
      framesRejectedLength: this.framesRejectedLength,
      framesRejectedRate: this.framesRejectedRate,
      rejectedHandshakes: this.rejectedHandshakes,
      activeConnections: this.activeConnections,
    };
  }

  private handleConnection(socket: WebSocket, cn: string): void {
    this.activeConnections += 1;
    this.log.log(`edge bridge connected: cn=${cn}`);
    const bucket = new TokenBucket({
      capacity: this.rateLimitPerConnection,
      refillPerSecond: this.rateLimitPerConnection,
    });

    socket.on('message', (data: RawData) => {
      const raw = rawDataToUtf8(data).trim();
      if (raw.length === 0) return;
      if (raw.length > NMEA_MAX_LENGTH) {
        this.framesRejectedLength += 1;
        return;
      }
      if (!bucket.tryConsume()) {
        this.framesRejectedRate += 1;
        return;
      }
      const frame: NmeaFrame = {
        raw,
        receivedAt: Date.now(),
        sourceId: SOURCE_ID,
      };
      this.framesAccepted += 1;
      this.frameListeners.forEach((listener) => listener(frame));
    });

    socket.on('error', (err) => {
      this.errorListeners.forEach((listener) => listener(err));
    });

    socket.on('close', () => {
      this.activeConnections -= 1;
      this.log.log(`edge bridge disconnected: cn=${cn}`);
    });
  }
}

export function extractCn(cert: unknown): string | null {
  if (!cert || typeof cert !== 'object') return null;
  const subject = (cert as { subject?: unknown }).subject;
  if (!subject || typeof subject !== 'object') return null;
  const cn = (subject as { CN?: unknown }).CN;
  return typeof cn === 'string' && cn.length > 0 ? cn : null;
}

function rawDataToUtf8(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}
