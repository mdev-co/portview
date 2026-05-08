import dgram from 'node:dgram';
import type { ISource, NmeaFrame, Unsubscribe } from '@sps/shared';
import { SourceId } from '@sps/shared';
import { TokenBucket } from './token-bucket';

const SOURCE_ID = SourceId.LocalUdp;
const SOURCE_PRIORITY = 1;
const DEFAULT_PORT = 10110;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_RATE_LIMIT = 200;
const NMEA_MAX_LENGTH = 82;

export interface LocalUdpSourceOptions {
  readonly port?: number;
  readonly host?: string;
  readonly rateLimit?: number;
}

type FrameCallback = (frame: NmeaFrame) => void;
type ErrorCallback = (error: Error) => void;

export class LocalUdpSource implements ISource {
  readonly id: SourceId = SOURCE_ID;
  readonly priority = SOURCE_PRIORITY;

  private readonly port: number;
  private readonly host: string;
  private readonly bucket: TokenBucket;
  private readonly frameListeners = new Set<FrameCallback>();
  private readonly errorListeners = new Set<ErrorCallback>();
  private socket: dgram.Socket | null = null;
  private messagesEmitted = 0;
  private droppedByRateLimit = 0;
  private droppedByLength = 0;

  constructor(options: LocalUdpSourceOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
    this.bucket = new TokenBucket({
      capacity: options.rateLimit ?? DEFAULT_RATE_LIMIT,
      refillPerSecond: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async start(): Promise<void> {
    if (this.socket) return;

    return new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: false });

      const onBindError = (err: Error): void => {
        socket.removeListener('error', onBindError);
        reject(err);
      };
      socket.once('error', onBindError);

      socket.on('message', msg => this.handleMessage(msg));

      socket.bind({ port: this.port, address: this.host, exclusive: true }, () => {
        socket.removeListener('error', onBindError);
        socket.on('error', err => {
          this.errorListeners.forEach(l => l(err));
        });
        this.socket = socket;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    return new Promise<void>(resolve => {
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
    this.frameListeners.forEach(l => l(frame));
  }
}
