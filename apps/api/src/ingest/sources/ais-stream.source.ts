import type {
  ISource,
  LngLatBounds,
  NmeaFrame,
  Unsubscribe,
} from '@sps/shared';
import { SourceId } from '@sps/shared';

const SOURCE_ID = SourceId.AisStream;
const SOURCE_PRIORITY = 3;
const TOKEN_ENV = 'EXTERNAL_FEED_TOKEN';
const ENDPOINT_ENV = 'EXTERNAL_FEED_ENDPOINT';

const DEFAULT_BOUNDING_BOX: LngLatBounds = [
  [13.5, 52.5],
  [16.5, 54.5],
];

export function boundsToApiPayload(
  bounds: LngLatBounds,
): readonly [readonly [number, number], readonly [number, number]] {
  const [[swLng, swLat], [neLng, neLat]] = bounds;
  return [
    [swLat, swLng],
    [neLat, neLng],
  ];
}

export type SourceLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SourceLogger = (
  level: SourceLogLevel,
  message: string,
  data?: unknown,
) => void;

export interface AisStreamSourceOptions {
  readonly token?: string;
  readonly endpoint?: string;
  readonly boundingBox?: LngLatBounds;
  readonly logger?: SourceLogger;
}

type FrameCallback = (frame: NmeaFrame) => void;
type ErrorCallback = (error: Error) => void;

function decodeMessageData(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    const view = data;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString(
      'utf8',
    );
  }
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return null;
}

export class AisStreamSource implements ISource {
  readonly id: SourceId = SOURCE_ID;
  readonly priority = SOURCE_PRIORITY;

  private readonly endpoint: string;
  private readonly token: string;
  private readonly boundingBox: LngLatBounds;
  private readonly frameListeners = new Set<FrameCallback>();
  private readonly errorListeners = new Set<ErrorCallback>();
  private readonly log?: SourceLogger;
  private socket: WebSocket | null = null;
  private messagesReceived = 0;

  constructor(options: AisStreamSourceOptions = {}) {
    const token = options.token ?? process.env[TOKEN_ENV];
    if (!token || token.length === 0) {
      throw new Error(
        `AisStreamSource requires the ${TOKEN_ENV} environment variable or an explicit token option.`,
      );
    }
    const endpoint = options.endpoint ?? process.env[ENDPOINT_ENV];
    if (!endpoint || endpoint.length === 0) {
      throw new Error(
        `AisStreamSource requires the ${ENDPOINT_ENV} environment variable or an explicit endpoint option.`,
      );
    }
    this.token = token;
    this.endpoint = endpoint;
    this.boundingBox = options.boundingBox ?? DEFAULT_BOUNDING_BOX;
    this.log = options.logger;
  }

  async start(): Promise<void> {
    if (this.socket) return;

    this.log?.('debug', 'opening WebSocket');

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.endpoint);
      ws.binaryType = 'arraybuffer';

      const onConnectError = (event: Event): void => {
        ws.removeEventListener('open', onConnectOpen);
        ws.removeEventListener('error', onConnectError);
        this.socket = null;
        const err = new Error(`WebSocket failed to connect: ${event.type}`);
        this.log?.('error', 'connect error', { event: event.type });
        reject(err);
      };

      const onConnectOpen = (): void => {
        ws.removeEventListener('open', onConnectOpen);
        ws.removeEventListener('error', onConnectError);

        const subscribe = {
          APIKey: this.token,
          BoundingBoxes: [boundsToApiPayload(this.boundingBox)],
        };
        ws.send(JSON.stringify(subscribe));
        this.log?.('info', 'subscribe sent', { boundingBox: this.boundingBox });

        ws.addEventListener('message', (evt) => this.handleMessage(evt));
        ws.addEventListener('close', (evt) => {
          if (this.socket === ws) {
            this.socket = null;
            this.log?.('warn', 'WebSocket closed', {
              code: evt.code,
              reason: evt.reason,
              wasClean: evt.wasClean,
              messagesReceived: this.messagesReceived,
            });
            this.errorListeners.forEach((l) =>
              l(
                new Error(
                  `WebSocket closed (code ${evt.code}${evt.reason ? `: ${evt.reason}` : ''})`,
                ),
              ),
            );
          }
        });
        ws.addEventListener('error', (evt) => {
          if (this.socket === ws) {
            this.log?.('error', 'WebSocket runtime error', { event: evt.type });
            this.errorListeners.forEach((l) =>
              l(new Error(`WebSocket runtime error: ${evt.type}`)),
            );
          }
        });

        this.socket = ws;
        resolve();
      };

      ws.addEventListener('open', onConnectOpen);
      ws.addEventListener('error', onConnectError);
    });
  }

  async stop(): Promise<void> {
    const ws = this.socket;
    if (!ws) return;
    this.socket = null;
    return new Promise<void>((resolve) => {
      const onClose = (): void => {
        ws.removeEventListener('close', onClose);
        resolve();
      };
      ws.addEventListener('close', onClose);
      ws.close(1000, 'Source stopped');
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

  getMessagesReceived(): number {
    return this.messagesReceived;
  }

  getStats(): Readonly<Record<string, number>> {
    return { messagesReceived: this.messagesReceived };
  }

  private handleMessage(evt: MessageEvent): void {
    const decoded = decodeMessageData(evt.data);
    if (decoded === null) {
      this.log?.('warn', 'unsupported message data type', {
        ctor: (evt.data as { constructor?: { name: string } } | null)
          ?.constructor?.name,
      });
      return;
    }
    const raw = decoded.trim();
    if (raw.length === 0) return;
    this.messagesReceived += 1;
    if (this.messagesReceived <= 3) {
      this.log?.('debug', 'message received', {
        index: this.messagesReceived,
        bytes: decoded.length,
        sample: raw.slice(0, 200),
      });
    }
    const frame: NmeaFrame = {
      raw,
      receivedAt: Date.now(),
      sourceId: SOURCE_ID,
    };
    this.frameListeners.forEach((l) => l(frame));
  }
}
