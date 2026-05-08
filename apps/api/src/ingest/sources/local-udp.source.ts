import dgram from 'node:dgram';
import type { ISource, NmeaFrame, Unsubscribe } from '@sps/shared';
import { SourceId } from '@sps/shared';
import { TokenBucket } from './token-bucket';

const SOURCE_ID = SourceId.LocalUdp;
const SOURCE_PRIORITY = 1;
const DEFAULT_PORT = 10110;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_RATE_LIMIT = 200;
const DEFAULT_FIRST_FRAME_TIMEOUT_MS = 5_000;
const NMEA_MAX_LENGTH = 82;

export interface LocalUdpSourceOptions {
  readonly port?: number;
  readonly host?: string;
  readonly rateLimit?: number;
  readonly firstFrameTimeoutMs?: number;
}

type FrameCallback = (frame: NmeaFrame) => void;
type ErrorCallback = (error: Error) => void;

/**
 * Local UDP listener for AIS NMEA datagrams from a co-located rtl_ais
 * receiver. Binds to (host, port) and emits validated NmeaFrame events
 * up to `rateLimit` per second.
 *
 * `start()` does not resolve on the bind callback alone. It waits up
 * to `firstFrameTimeoutMs` (5 s by default) for the first datagram to
 * arrive; if no traffic appears in that window the bind is closed and
 * `start()` rejects, which lets the priority FSM advance to the next
 * source instead of sitting in `active` for a full HEALTHY_WINDOW (30 s)
 * just because the socket bound successfully on a host with no SDR
 * attached.
 */
export class LocalUdpSource implements ISource {
  readonly id: SourceId = SOURCE_ID;
  readonly priority = SOURCE_PRIORITY;

  private readonly port: number;
  private readonly host: string;
  private readonly firstFrameTimeoutMs: number;
  private readonly bucket: TokenBucket;
  private readonly frameListeners = new Set<FrameCallback>();
  private readonly errorListeners = new Set<ErrorCallback>();
  private socket: dgram.Socket | null = null;
  private firstFrameSeen = false;
  private messagesEmitted = 0;
  private droppedByRateLimit = 0;
  private droppedByLength = 0;

  constructor(options: LocalUdpSourceOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
    this.firstFrameTimeoutMs =
      options.firstFrameTimeoutMs ?? DEFAULT_FIRST_FRAME_TIMEOUT_MS;
    this.bucket = new TokenBucket({
      capacity: options.rateLimit ?? DEFAULT_RATE_LIMIT,
      refillPerSecond: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async start(): Promise<void> {
    if (this.socket) return;

    return new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: false });
      let timeoutHandle: NodeJS.Timeout | null = null;

      const onBindError = (err: Error): void => {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        socket.removeListener('error', onBindError);
        reject(err);
      };
      socket.once('error', onBindError);

      const onFirstMessage = (msg: Buffer): void => {
        if (this.firstFrameSeen) {
          this.handleMessage(msg);
          return;
        }
        this.firstFrameSeen = true;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        socket.removeListener('error', onBindError);
        socket.on('error', (err) => {
          this.errorListeners.forEach((listener) => listener(err));
        });
        this.socket = socket;
        this.handleMessage(msg);
        resolve();
      };

      socket.on('message', onFirstMessage);

      socket.bind(
        { port: this.port, address: this.host, exclusive: true },
        () => {
          timeoutHandle = setTimeout(() => {
            timeoutHandle = null;
            if (this.firstFrameSeen) return;
            socket.removeListener('error', onBindError);
            socket.removeListener('message', onFirstMessage);
            socket.close();
            reject(
              new Error(
                `LocalUdpSource bound to ${this.host}:${this.port} but no datagram arrived within ${this.firstFrameTimeoutMs}ms`,
              ),
            );
          }, this.firstFrameTimeoutMs);
        },
      );
    });
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    this.firstFrameSeen = false;
    return new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });
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

  getDroppedByRateLimit(): number {
    return this.droppedByRateLimit;
  }

  getDroppedByLength(): number {
    return this.droppedByLength;
  }

  getStats(): Readonly<Record<string, number>> {
    return {
      messagesEmitted: this.messagesEmitted,
      droppedByLength: this.droppedByLength,
      droppedByRateLimit: this.droppedByRateLimit,
    };
  }

  private handleMessage(message: Buffer): void {
    if (message.length > NMEA_MAX_LENGTH) {
      this.droppedByLength += 1;
      return;
    }
    if (!this.bucket.tryConsume()) {
      this.droppedByRateLimit += 1;
      return;
    }
    const raw = message.toString('utf8').trim();
    if (raw.length === 0) return;
    const frame: NmeaFrame = {
      raw,
      receivedAt: Date.now(),
      sourceId: SOURCE_ID,
    };
    this.messagesEmitted += 1;
    this.frameListeners.forEach((listener) => listener(frame));
  }
}
