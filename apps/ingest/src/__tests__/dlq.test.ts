import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SourceId } from '@sps/shared';
import { DeadLetterWriter } from '../dlq';

describe('DeadLetterWriter', () => {
  let tmp: string;
  let target: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'sps-dlq-'));
    target = path.join(tmp, 'rejected.jsonl');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a single JSONL row for one rejected frame', () => {
    const writer = new DeadLetterWriter({ path: target });
    writer.write({
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    writer.close();
    const content = readFileSync(target, 'utf8').trim();
    const row = JSON.parse(content);
    expect(row).toMatchObject({
      source: 'LocalUdp',
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('appends multiple rows on consecutive writes', () => {
    const writer = new DeadLetterWriter({ path: target });
    for (let i = 0; i < 3; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.AisStream,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'parse-error', detail: 'short' },
      });
    }
    writer.close();
    const lines = readFileSync(target, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed.map(r => r.raw)).toEqual(['frame-0', 'frame-1', 'frame-2']);
    expect(parsed.every(r => r.source === 'AisStream')).toBe(true);
  });

  it('serialises a semantic reject reason with its payload', () => {
    const writer = new DeadLetterWriter({ path: target });
    writer.write({
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      sourceId: SourceId.WebSdr,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'invalid-mmsi', value: 100_000_000 },
    });
    writer.close();
    const row = JSON.parse(readFileSync(target, 'utf8').trim());
    expect(row.reason).toEqual({ kind: 'invalid-mmsi', value: 100_000_000 });
    expect(row.source).toBe('WebSdr');
  });

  it('creates the parent directory if it does not exist', () => {
    const nested = path.join(tmp, 'nested', 'deep', 'rejected.jsonl');
    const writer = new DeadLetterWriter({ path: nested });
    writer.write({
      raw: 'frame',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'bad-checksum', detail: 'x' },
    });
    writer.close();
    expect(readFileSync(nested, 'utf8').trim().length).toBeGreaterThan(0);
  });

  it('rotates to .old when the file exceeds maxBytes', () => {
    const writer = new DeadLetterWriter({
      path: target,
      maxBytes: 200,
      rotateCheckEvery: 2,
    });
    // Each row is well under 200 bytes; we need several rows to exceed
    // the cap, and then enough subsequent writes to trip the rotate
    // check (every 2 writes here).
    for (let i = 0; i < 12; i += 1) {
      writer.write({
        raw: `frame-${i}-with-some-padding-to-grow-the-file-faster-${'x'.repeat(40)}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    writer.close();
    expect(existsSync(`${target}.old`)).toBe(true);
    // The active file exists post-rotation and contains the most recent
    // entries (rotation truncated the previous content via rename).
    expect(readFileSync(target, 'utf8').length).toBeGreaterThan(0);
  });
});
