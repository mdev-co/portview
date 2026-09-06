import {
  createWriteStream,
  mkdirSync,
  renameSync,
  statSync,
  type WriteStream,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type SourceId, sourceIdName } from '@sps/shared';
import type { AisStreamAdapterRejection } from './adapters/ais-stream.adapter';
import type { DecodeRejection } from './decoder';
import type { MmsiRejectionReason } from './validators/mmsi-validator';
import type { PositionRejectionReason } from './validators/position-validator';

export type SecurityRejection =
  | { readonly kind: MmsiRejectionReason; readonly detail: string }
  | { readonly kind: PositionRejectionReason; readonly detail: string }
  | { readonly kind: 'mmsi-flooding'; readonly detail: string }
  | { readonly kind: 'new-mmsi-cap'; readonly detail: string };

export type DlqReason =
  | DecodeRejection
  | AisStreamAdapterRejection
  | SecurityRejection;

export type DlqRow = {
  readonly ts: string;
  readonly source: string;
  readonly reason: DlqReason;
  readonly raw: string;
};

export type DlqWriteParams = {
  readonly raw: string;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
  readonly reason: DlqReason;
};

export type DeadLetterWriterOptions = {
  readonly path?: string;
  readonly maxBytes?: number;
  readonly rotateCheckEvery?: number;
  /**
   * Rows held in the overflow buffer while the stream reports
   * backpressure or a rotation swap is in flight. Overflow beyond the
   * cap is dropped and counted, never accumulated.
   */
  readonly maxBufferedRows?: number;
  /**
   * Stream buffer size before `write()` reports backpressure. Test
   * hook; production uses the Node default.
   */
  readonly highWaterMark?: number;
  /**
   * Called exactly once, at the moment the writer latches into the
   * failed state. Without an observer the latch is invisible: the FSM
   * keeps counting FRAME_REJECTED so metrics look healthy while the
   * audit trail is silently dead.
   */
  readonly onLatch?: (context: string, error: unknown) => void;
};

export type DlqStats = {
  readonly failed: boolean;
  readonly pending: number;
  readonly written: number;
  readonly droppedByBackpressure: number;
};

const DEFAULT_DIR_NAME = '.sps-data';
const DEFAULT_FILE_NAME = 'rejected_frames.jsonl';
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_ROTATE_CHECK = 100;
const DEFAULT_MAX_BUFFERED_ROWS = 1000;
const ENV_PATH_OVERRIDE = 'SPS_DLQ_PATH';
/** close() waits at most this long for pending writes before releasing the fd. */
const CLOSE_FLUSH_TIMEOUT_MS = 5_000;

function defaultPath(): string {
  return path.join(os.homedir(), DEFAULT_DIR_NAME, DEFAULT_FILE_NAME);
}

/**
 * Append-only JSONL writer for poison frames. Each entry is one line of
 * structured JSON with enough context to debug, audit, or feed an LLM
 * training corpus without retaining the binary frame buffer.
 *
 * Default output is `~/.sps-data/rejected_frames.jsonl`, deliberately
 * outside the repository working tree. The audit trail therefore cannot
 * be staged by accident, and a future move to an external volume only
 * needs an env-var override (`SPS_DLQ_PATH`).
 *
 * The writer caps the active file at a configurable byte budget (default
 * 50 MB). When exceeded, the file is rotated: the stream is closed, the
 * file renamed to `<path>.old` (overwriting any previous rotation), and
 * a fresh stream opened. Two-file retention keeps disk usage bounded
 * under any traffic profile and the rename is atomic.
 *
 * Rows flow through a single append-mode `WriteStream`: one fd for the
 * file's lifetime, rows on disk in write order, flushing off the event
 * loop. The earliest implementation used `appendFileSync`, which under
 * sustained rejection bursts (Pi reconnect after a deploy flushes a
 * queue that contains many out-of-spec frames) blocked the Node event
 * loop long enough to starve `/healthz` of cycles and trip Fly's
 * liveness check. When the stream signals backpressure, rows queue in
 * a bounded buffer and overflow is dropped and counted
 * (`droppedByBackpressure`), so memory stays flat during a storm. Rows
 * arriving mid-rotation wait in the same bounded buffer. Failures latch
 * the writer into a failed state without throwing into the ingest hot
 * path; the reopen after a rotation gets one retry before latching.
 */
export class DeadLetterWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly rotateCheckEvery: number;
  private readonly maxBufferedRows: number;
  private readonly highWaterMark?: number;
  private readonly onLatch?: (context: string, error: unknown) => void;
  private stream: WriteStream | null = null;
  private rotation: Promise<void> | null = null;
  private queue: string[] = [];
  private backpressured = false;
  private dirEnsured = false;
  private failed = false;
  private closed = false;
  private writesSinceRotateCheck = 0;
  private sizeBytes = 0;
  private pending = 0;
  private written = 0;
  private droppedByBackpressure = 0;
  private waiters: Array<() => void> = [];

  constructor(options: DeadLetterWriterOptions = {}) {
    this.filePath =
      options.path ?? process.env[ENV_PATH_OVERRIDE] ?? defaultPath();
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.rotateCheckEvery = options.rotateCheckEvery ?? DEFAULT_ROTATE_CHECK;
    this.maxBufferedRows = options.maxBufferedRows ?? DEFAULT_MAX_BUFFERED_ROWS;
    this.highWaterMark = options.highWaterMark;
    this.onLatch = options.onLatch;
  }

  stats(): DlqStats {
    return {
      failed: this.failed,
      pending: this.pending,
      written: this.written,
      droppedByBackpressure: this.droppedByBackpressure,
    };
  }

  write(params: DlqWriteParams): void {
    if (this.failed || this.closed) return;
    if (!this.ensureDir()) return;
    if (this.stream === null && this.rotation === null) {
      this.openStream(false);
    }
    if (this.writesSinceRotateCheck >= this.rotateCheckEvery) {
      this.writesSinceRotateCheck = 0;
      if (this.stream !== null && this.sizeBytes > this.maxBytes) {
        this.beginRotation();
      }
    }
    const row: DlqRow = {
      ts: new Date(params.receivedAt).toISOString(),
      source: sourceIdName(params.sourceId),
      reason: params.reason,
      raw: params.raw,
    };
    const line = `${JSON.stringify(row)}\n`;
    this.writesSinceRotateCheck += 1;
    // Rows detour through the bounded queue whenever the stream cannot
    // take them right now (rotation swap, backpressure) or older rows
    // are already queued (order guarantee). Overflow is dropped, not
    // buffered: a wedged disk must never turn into unbounded memory.
    if (this.stream === null || this.backpressured || this.queue.length > 0) {
      if (this.queue.length >= this.maxBufferedRows) {
        this.droppedByBackpressure += 1;
        return;
      }
      this.queue.push(line);
      this.pending += 1;
      return;
    }
    this.pending += 1;
    this.writeToStream(this.stream, line);
  }

  /**
   * Resolves once every write scheduled before the call has hit disk.
   * Production never awaits this; tests use it to assert against the
   * written file. Returns immediately when no writes are in flight.
   */
  flush(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Drains everything scheduled so far, ends the stream, and resolves
   * once the fd is released. Safe to call more than once; writes after
   * close are ignored.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.rotation !== null) await this.rotation;
    // Bounded drain: a stalled disk must not turn shutdown into a hang.
    // Rows still pending after the timeout are lost, which is the
    // documented contract for a best-effort dead-letter file.
    let timer: NodeJS.Timeout | null = null;
    const drained = await Promise.race([
      this.flush().then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), CLOSE_FLUSH_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
    if (timer !== null) clearTimeout(timer);
    if (!drained) {
      this.onLatch?.(
        'close',
        new Error(
          `flush did not settle within ${String(CLOSE_FLUSH_TIMEOUT_MS)} ms`,
        ),
      );
    }
    const stream = this.stream;
    this.stream = null;
    if (stream === null) return;
    await new Promise<void>((resolve) => {
      stream.once('close', () => resolve());
      stream.end(() => resolve());
    });
  }

  private writeToStream(stream: WriteStream, line: string): void {
    this.sizeBytes += Buffer.byteLength(line);
    // The callback fires when the chunk has been written to the fd (or
    // the stream was destroyed), so `pending` tracks rows not yet on
    // disk. Errors here only settle counters; latching is owned by the
    // stream 'error' handler.
    const accepted = stream.write(line, (err) => {
      if (err == null) this.written += 1;
      if (this.pending > 0) this.pending -= 1;
      this.releaseWaitersIfIdle();
    });
    if (!accepted) this.backpressured = true;
  }

  private drainQueue(): void {
    const stream = this.stream;
    if (stream === null) return;
    while (!this.backpressured) {
      const line = this.queue.shift();
      if (line === undefined) return;
      this.writeToStream(stream, line);
    }
  }

  private openStream(isRotationReopen: boolean): void {
    let initialSize = 0;
    try {
      initialSize = statSync(this.filePath).size;
    } catch {
      initialSize = 0;
    }
    const stream = createWriteStream(this.filePath, {
      flags: 'a',
      ...(this.highWaterMark !== undefined
        ? { highWaterMark: this.highWaterMark }
        : {}),
    });
    stream.on('error', (err) => {
      if (this.stream === stream) this.stream = null;
      if (isRotationReopen && !this.failed && !this.closed) {
        this.openStream(false);
        this.drainQueue();
        return;
      }
      this.latch('stream', err);
    });
    stream.on('drain', () => {
      if (this.stream !== stream) return;
      this.backpressured = false;
      this.drainQueue();
    });
    this.sizeBytes = initialSize;
    this.backpressured = false;
    this.stream = stream;
  }

  private beginRotation(): void {
    const stream = this.stream;
    if (stream === null) return;
    this.stream = null;
    this.backpressured = false;
    this.rotation = new Promise<void>((resolve) => {
      const settle = (): void => {
        this.rotation = null;
        resolve();
      };
      // 'finish' never fires on an errored stream; the error listener
      // settles the rotation so close() cannot hang, and the stream's
      // own 'error' handler performs the latch.
      stream.once('error', settle);
      stream.end(() => {
        if (this.failed) {
          settle();
          return;
        }
        try {
          renameSync(this.filePath, `${this.filePath}.old`);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') {
            this.latch('rotate', err);
            settle();
            return;
          }
        }
        // Reopen even when close() arrived mid-rotation if rows are
        // still queued: they were accepted before close and must land
        // on disk for close()'s drain guarantee to hold.
        if (!this.closed || this.queue.length > 0) {
          this.openStream(true);
          this.drainQueue();
        }
        settle();
      });
    });
  }

  private ensureDir(): boolean {
    if (this.dirEnsured) return true;
    try {
      const dir = path.dirname(this.filePath);
      if (dir.length > 0 && dir !== '.') {
        mkdirSync(dir, { recursive: true });
      }
      this.dirEnsured = true;
      return true;
    } catch (err) {
      this.latch('mkdir', err);
      return false;
    }
  }

  private releaseWaitersIfIdle(): void {
    if (this.pending !== 0 || this.waiters.length === 0) return;
    const toResolve = this.waiters;
    this.waiters = [];
    for (const resolve of toResolve) resolve();
  }

  private latch(context: string, error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.queue = [];
    this.pending = 0;
    this.releaseWaitersIfIdle();
    this.onLatch?.(context, error);
  }
}
