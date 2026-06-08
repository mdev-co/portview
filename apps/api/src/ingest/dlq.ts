import {
  appendFile as appendFileAsync,
  mkdirSync,
  renameSync,
  statSync,
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
};

const DEFAULT_DIR_NAME = '.sps-data';
const DEFAULT_FILE_NAME = 'rejected_frames.jsonl';
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_ROTATE_CHECK = 100;
const ENV_PATH_OVERRIDE = 'SPS_DLQ_PATH';

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
 * 50 MB). When exceeded, the file is rotated by rename to `<path>.old`,
 * which overwrites any previous rotation. Two-file retention keeps disk
 * usage bounded under any traffic profile and the rename is atomic.
 *
 * Asynchronous append per call. The earlier implementation used
 * `appendFileSync` for deterministic flush, which under sustained
 * rejection bursts (Pi reconnect after a deploy flushes a queue that
 * contains many out-of-spec frames) blocks the Node event loop long
 * enough to starve `/healthz` of cycles and trip Fly's liveness check.
 * The async form returns immediately; rotation still uses sync stat /
 * rename because those run once per `rotateCheckEvery` writes (default
 * 100) and their cost is amortised. Write failures latch the writer
 * into a failed state without throwing into the ingest hot path.
 */
export class DeadLetterWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly rotateCheckEvery: number;
  private dirEnsured = false;
  private failed = false;
  private writesSinceRotateCheck = 0;
  private pending = 0;
  private waiters: Array<() => void> = [];

  constructor(options: DeadLetterWriterOptions = {}) {
    this.filePath =
      options.path ?? process.env[ENV_PATH_OVERRIDE] ?? defaultPath();
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.rotateCheckEvery = options.rotateCheckEvery ?? DEFAULT_ROTATE_CHECK;
  }

  write(params: DlqWriteParams): void {
    if (this.failed) return;
    if (!this.ensureDir()) return;
    if (this.writesSinceRotateCheck >= this.rotateCheckEvery) {
      this.writesSinceRotateCheck = 0;
      this.rotateIfOversized();
      if (this.failed) return;
    }
    const row: DlqRow = {
      ts: new Date(params.receivedAt).toISOString(),
      source: sourceIdName(params.sourceId),
      reason: params.reason,
      raw: params.raw,
    };
    this.writesSinceRotateCheck += 1;
    this.pending += 1;
    // Fire-and-forget. The callback only latches the failed flag and
    // releases any `flush()` waiters so the hot path returns inside
    // microseconds even when the underlying disk is slow. Lost
    // rejection rows under a transient EIO are acceptable; a wedged
    // event loop is not.
    appendFileAsync(this.filePath, `${JSON.stringify(row)}\n`, (err) => {
      if (err !== null) {
        this.failed = true;
      }
      this.pending -= 1;
      if (this.pending === 0 && this.waiters.length > 0) {
        const toResolve = this.waiters;
        this.waiters = [];
        for (const resolve of toResolve) resolve();
      }
    });
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

  close(): void {
    // No-op for the synchronous implementation; retained on the public
    // surface so future async backends (S3, IndexedDB) can drop in.
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
    } catch {
      this.failed = true;
      return false;
    }
  }

  private rotateIfOversized(): void {
    try {
      const stat = statSync(this.filePath);
      if (stat.size <= this.maxBytes) return;
      renameSync(this.filePath, `${this.filePath}.old`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      this.failed = true;
    }
  }
}
