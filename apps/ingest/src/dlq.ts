import { appendFileSync, mkdirSync } from 'node:fs';
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
};

const DEFAULT_PATH = '.data/rejected_frames.jsonl';

/**
 * Append-only JSONL writer for poison frames. Each entry is one line of
 * structured JSON with enough context to debug, audit, or feed an LLM
 * training corpus without retaining the binary frame buffer.
 *
 * Implementation uses a synchronous append per call. Poison frames are
 * rare (one per truly broken transmission) and the deterministic flush
 * makes the file usable for live tailing during development. Write
 * failures latch the writer into a failed state without throwing into
 * the ingest hot path.
 */
export class DeadLetterWriter {
  private readonly filePath: string;
  private dirEnsured = false;
  private failed = false;

  constructor(options: DeadLetterWriterOptions = {}) {
    this.filePath = options.path ?? DEFAULT_PATH;
  }

  write(params: DlqWriteParams): void {
    if (this.failed) return;
    if (!this.ensureDir()) return;
    const row: DlqRow = {
      ts: new Date(params.receivedAt).toISOString(),
      source: sourceIdName(params.sourceId),
      reason: params.reason,
      raw: params.raw,
    };
    try {
      appendFileSync(this.filePath, `${JSON.stringify(row)}\n`);
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
}
