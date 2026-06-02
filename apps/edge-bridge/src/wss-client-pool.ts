import { createLogger } from './logger.js';
import { type TlsClientCredentials, WssClient, type WssClientOptions } from './wss-client.js';

const log = createLogger('wss-pool');

export type WssClientPoolOptions = Omit<WssClientOptions, 'url'> & {
  readonly urls: readonly string[];
  readonly tls?: TlsClientCredentials;
};

type PoolSinkStats = {
  readonly url: string;
  readonly state: ReturnType<WssClient['getStats']>['state'];
  readonly framesSent: number;
  readonly framesDropped: number;
  readonly queueSize: number;
  readonly backpressureWarnings: number;
};

/**
 * Broadcast fan-out over N WssClient sinks. Every frame received by
 * {@link send} is delivered to every sink independently; one sink in
 * reconnect backoff or queue-overflow does NOT slow another. Each sink
 * keeps its own queue, reconnect state machine and stats.
 *
 * Why a pool instead of inlining fan-out in `index.ts`:
 *  - Single-sink semantics stay unchanged in {@link WssClient}, which is
 *    the unit that gets covered by integration testing on the Pi.
 *  - Pool fan-out semantics get their own unit test surface (drop one,
 *    broadcast continues; stop awaits every shutdown).
 *  - Future per-sink behaviour (priority sink, sink-specific rate limit,
 *    heartbeat) drops in without rewriting the listener glue.
 *
 * Failure model:
 *  - {@link start} never throws. Each sink begins its own connect cycle;
 *    permanent failures appear as repeating reconnect logs from that
 *    sink only.
 *  - {@link send} is fire-and-forget across sinks. Backpressure or queue
 *    overflow on one sink causes that sink's own drop counter to tick;
 *    other sinks are unaffected.
 *  - {@link stop} awaits every sink via `Promise.allSettled` and races
 *    the aggregate against an overall budget so a single hung sink
 *    cannot stretch shutdown past `systemd TimeoutStopSec`.
 */
export class WssClientPool {
  private readonly clients: readonly WssClient[];
  private readonly urls: readonly string[];

  constructor(options: WssClientPoolOptions) {
    if (options.urls.length === 0) {
      throw new Error('WssClientPool requires at least one backend URL');
    }
    this.urls = options.urls;
    this.clients = options.urls.map(
      url =>
        new WssClient({
          url,
          initialBackoffMs: options.initialBackoffMs,
          maxBackoffMs: options.maxBackoffMs,
          reconnectJitterMs: options.reconnectJitterMs,
          connectionTimeoutMs: options.connectionTimeoutMs,
          sendQueueLimit: options.sendQueueLimit,
          backpressureWarnBytes: options.backpressureWarnBytes,
          shutdownGraceMs: options.shutdownGraceMs,
          ...(options.tls ? { tls: options.tls } : {}),
        }),
    );
    log.info('pool constructed', { sinks: this.urls.length, urls: this.urls });
  }

  start(): void {
    for (const client of this.clients) client.start();
  }

  send(payload: string): void {
    for (const client of this.clients) client.send(payload);
  }

  /**
   * Shut every sink down in parallel. Uses `Promise.allSettled` so one
   * sink whose `stop()` rejects (e.g. an unguarded throw inside the
   * underlying client teardown) does not strand the others as unawaited
   * promises - the broadcast philosophy applies to teardown too.
   *
   * The outer race against `maxShutdownMs` caps the total wait
   * regardless of per-sink behaviour. Without it a single hung sink
   * would block until its own `shutdownGraceMs + hard-close-timeout`,
   * which stacked across the pool can exceed the systemd unit's
   * `TimeoutStopSec` and trigger a SIGKILL.
   */
  async stop(maxShutdownMs = 12_000): Promise<void> {
    const settled = Promise.allSettled(this.clients.map(c => c.stop()));
    const timeout = new Promise<'timeout'>(resolve => {
      setTimeout(() => resolve('timeout'), maxShutdownMs);
    });
    const winner = await Promise.race([settled, timeout]);
    if (winner === 'timeout') {
      log.warn('pool shutdown budget exceeded, returning early', {
        budgetMs: maxShutdownMs,
        sinks: this.urls.length,
      });
      return;
    }
    for (const result of winner) {
      if (result.status === 'rejected') {
        log.warn('sink shutdown rejected', { error: String(result.reason) });
      }
    }
  }

  getStats(): readonly PoolSinkStats[] {
    // `clients` and `urls` share the same constructor-time index, so
    // `urls[i]` is always defined alongside `clients[i]`. The non-null
    // assertion documents this invariant for TS strict mode.
    return this.clients.map((client, index) => {
      const stats = client.getStats();
      return {
        url: this.urls[index] as string,
        state: stats.state,
        framesSent: stats.framesSent,
        framesDropped: stats.framesDropped,
        queueSize: stats.queueSize,
        backpressureWarnings: stats.backpressureWarnings,
      };
    });
  }
}
