import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createLogger } from './logger.js';

const log = createLogger('wss');

export type TlsClientCredentials = {
  readonly cert: Buffer;
  readonly key: Buffer;
  readonly ca: Buffer;
};

export type WssClientOptions = {
  readonly url: string;
  readonly initialBackoffMs: number;
  readonly maxBackoffMs: number;
  /**
   * Random delay added to every reconnect attempt (uniform in `[0, ms]`).
   * Prevents thundering-herd if the backend restarts and many bridges
   * reconnect simultaneously.
   */
  readonly reconnectJitterMs: number;
  /**
   * Time the client waits for the WSS handshake to complete before
   * giving up and triggering the reconnect cycle. Without this, a
   * silent network drop can wedge the connect attempt indefinitely.
   */
  readonly connectionTimeoutMs: number;
  readonly sendQueueLimit: number;
  /**
   * Threshold over which the client warns about WSS buffer growth.
   * On the Raspberry Pi (1 GB RAM) sustained backpressure is the
   * leading cause of OOM kills; surfacing it early lets us decide
   * whether to drop or apply backpressure to rtl_ais upstream.
   */
  readonly backpressureWarnBytes: number;
  readonly shutdownGraceMs: number;
  /**
   * mTLS credentials. When provided the WebSocket is constructed with
   * `cert`, `key`, `ca` and `rejectUnauthorized: true` so the backend
   * server certificate is verified and the client cert is presented to
   * the backend for mutual authentication.
   */
  readonly tls?: TlsClientCredentials;
};

type State = 'disconnected' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * WebSocket client wrapping the backend ingest endpoint. Owns the full
 * lifecycle of one persistent connection:
 *
 * - Exponential backoff reconnect: `initialBackoffMs * 2^attempt`,
 *   capped at `maxBackoffMs`. Resets to attempt 0 on every successful
 *   open so a long-running outage followed by recovery does not strand
 *   the client at the 30 s cap forever.
 *
 * - Send queue: frames received while disconnected sit in an in-memory
 *   queue, drained when the next `open` fires. Queue overflows drop
 *   oldest first via array shift on push when at the limit; a sampled
 *   warn (every 100th drop) keeps `journalctl` informative without
 *   spamming.
 *
 * - Graceful shutdown: on SIGTERM/SIGINT the bridge calls `stop()`,
 *   which drains the queue for up to `shutdownGraceMs` then sends a
 *   normal close frame (code 1000). Pi systemd unit lands the signal
 *   wiring in chunk 4.
 *
 * mTLS handshake (chunk 3) plugs into this client via the WebSocket
 * constructor `options` parameter: passing `cert`, `key` and `ca`
 * upgrades the connection without changing the state machine.
 */
export class WssClient extends EventEmitter {
  private state: State = 'disconnected';
  private ws: WebSocket | null = null;
  private readonly queue: string[] = [];
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private framesSent = 0;
  private framesDropped = 0;
  private backpressureWarnings = 0;
  private shutdownRequested = false;

  constructor(private readonly options: WssClientOptions) {
    super();
  }

  start(): void {
    this.connect();
  }

  private connect(): void {
    if (this.shutdownRequested) return;
    this.state = this.attempt === 0 ? 'connecting' : 'reconnecting';
    log.info('connecting', { url: this.options.url, attempt: this.attempt + 1 });

    const ws = this.options.tls
      ? new WebSocket(this.options.url, {
          cert: this.options.tls.cert,
          key: this.options.tls.key,
          ca: this.options.tls.ca,
          rejectUnauthorized: true,
        })
      : new WebSocket(this.options.url);
    this.ws = ws;

    // Handshake timeout: if the backend never responds, terminate the
    // socket so the close handler reschedules with backoff. Without
    // this a half-open TCP can keep the client stuck in `connecting`.
    this.connectionTimer = setTimeout(() => {
      if (this.state === 'connecting' || this.state === 'reconnecting') {
        log.warn('connection timeout, forcing close', {
          timeoutMs: this.options.connectionTimeoutMs,
        });
        try {
          ws.terminate();
        } catch {
          // ws may already be in a terminal state; close handler still fires.
        }
      }
    }, this.options.connectionTimeoutMs);

    ws.on('open', () => {
      this.clearConnectionTimer();
      log.info('open', { queuedFrames: this.queue.length });
      this.state = 'open';
      this.attempt = 0;
      this.drainQueue();
      this.emit('open');
    });

    ws.on('message', data => {
      this.emit('message', data);
    });

    ws.on('close', (code, reason) => {
      this.clearConnectionTimer();
      log.warn('closed', { code, reason: reason.toString('utf8') });
      this.ws = null;
      if (this.shutdownRequested) {
        this.state = 'closed';
        return;
      }
      this.scheduleReconnect();
    });

    ws.on('error', err => {
      // Errors immediately followed by `close` are the common case
      // (connection refused, DNS fail) so we log here but rely on the
      // close handler to schedule the next attempt.
      log.error('socket error', { error: err.message });
    });
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer !== null) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return;
    const exponent = Math.pow(2, this.attempt);
    const baseDelay = Math.min(this.options.initialBackoffMs * exponent, this.options.maxBackoffMs);
    // Add uniform jitter so a fleet restart does not deterministically
    // re-converge on identical retry instants. Caps at +jitterMs.
    const jitter = Math.floor(Math.random() * this.options.reconnectJitterMs);
    const delay = baseDelay + jitter;
    this.attempt += 1;
    this.state = 'reconnecting';
    log.info('reconnect scheduled', {
      delayMs: delay,
      baseDelayMs: baseDelay,
      jitterMs: jitter,
      nextAttempt: this.attempt,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(payload: string): void {
    if (this.state === 'open' && this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      this.framesSent += 1;
      this.checkBackpressure();
      return;
    }
    if (this.queue.length >= this.options.sendQueueLimit) {
      this.framesDropped += 1;
      if (this.framesDropped === 1 || this.framesDropped % 100 === 0) {
        log.warn('queue full, dropping frame', {
          totalDropped: this.framesDropped,
          queueSize: this.queue.length,
        });
      }
      return;
    }
    this.queue.push(payload);
  }

  private checkBackpressure(): void {
    if (this.ws === null) return;
    const buffered = this.ws.bufferedAmount;
    if (buffered <= this.options.backpressureWarnBytes) return;
    this.backpressureWarnings += 1;
    // Sample warnings so a sustained slow link does not flood journalctl.
    if (this.backpressureWarnings === 1 || this.backpressureWarnings % 50 === 0) {
      log.warn('backpressure', {
        bufferedBytes: buffered,
        thresholdBytes: this.options.backpressureWarnBytes,
        totalWarnings: this.backpressureWarnings,
      });
    }
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const frame = this.queue.shift();
      if (frame === undefined) break;
      this.ws.send(frame);
      this.framesSent += 1;
    }
  }

  async stop(): Promise<void> {
    this.shutdownRequested = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearConnectionTimer();

    if (this.ws === null) {
      this.state = 'closed';
      this.logShutdownStats();
      return;
    }

    const ws = this.ws;

    if (ws.readyState === WebSocket.OPEN && this.queue.length > 0) {
      const drainDeadline = Date.now() + this.options.shutdownGraceMs;
      while (
        this.queue.length > 0 &&
        Date.now() < drainDeadline &&
        ws.readyState === WebSocket.OPEN
      ) {
        const frame = this.queue.shift();
        if (frame === undefined) break;
        ws.send(frame);
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }

    return new Promise(resolve => {
      const finalize = (): void => {
        this.state = 'closed';
        this.ws = null;
        this.logShutdownStats();
        resolve();
      };
      if (ws.readyState === WebSocket.CLOSED) {
        finalize();
        return;
      }
      ws.once('close', finalize);
      try {
        ws.close(1000, 'shutdown');
      } catch {
        finalize();
        return;
      }
      // Hard timeout if the server never acks the close frame.
      setTimeout(finalize, 1000);
    });
  }

  private logShutdownStats(): void {
    log.info('stopped', {
      framesSent: this.framesSent,
      framesDropped: this.framesDropped,
      queuedAtShutdown: this.queue.length,
      backpressureWarnings: this.backpressureWarnings,
    });
  }

  getStats(): {
    readonly state: State;
    readonly framesSent: number;
    readonly framesDropped: number;
    readonly queueSize: number;
    readonly backpressureWarnings: number;
  } {
    return {
      state: this.state,
      framesSent: this.framesSent,
      framesDropped: this.framesDropped,
      queueSize: this.queue.length,
      backpressureWarnings: this.backpressureWarnings,
    };
  }
}
