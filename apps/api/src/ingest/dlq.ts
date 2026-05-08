import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type SourceId, sourceIdName } from '@sps/shared';
import type { DecodeRejection } from './decoder';

export type DlqRow = {
  readonly ts: string;
  readonly source: string;
  readonly reason: DecodeRejection;
  readonly raw: string;
};

export type DlqWriteParams = {
  readonly raw: string;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
  readonly reason: DecodeRejection;
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
 * Synchronous append per call. Poison frames are rare in normal traffic;
 * the deterministic flush makes the file usable for live tailing during
 * development. Write failures latch the writer into a failed state
 * without throwing into the ingest hot path.
 */
export class DeadLetterWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly rotateCheckEvery: number;
  private dirEnsured = false;
  private failed = false;
  private writesSinceRotateCheck = 0;

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
    try {
      appendFileSync(this.filePath, `${JSON.stringify(row)}\n`);
      this.writesSinceRotateCheck += 1;
    } catch {
      this.failed = true;
    }
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
