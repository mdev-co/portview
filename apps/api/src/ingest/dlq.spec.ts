import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SourceId } from '@sps/shared';
import { type DlqRow, DeadLetterWriter } from './dlq';

const parseRow = (raw: string): DlqRow => JSON.parse(raw) as DlqRow;

const readRows = (file: string): DlqRow[] =>
  readFileSync(file, 'utf8').trim().split('\n').map(parseRow);

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

  it('writes a single JSONL row for one rejected frame', async () => {
    const writer = new DeadLetterWriter({ path: target });
    writer.write({
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    await writer.flush();
    await writer.close();
    const row = parseRow(readFileSync(target, 'utf8').trim());
    expect(row).toMatchObject({
      source: 'LocalUdp',
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('appends multiple rows in write order', async () => {
    const writer = new DeadLetterWriter({ path: target });
    for (let i = 0; i < 3; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.AisStream,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'parse-error', detail: 'short' },
      });
    }
    await writer.flush();
    await writer.close();
    const parsed = readRows(target);
    // A single append-mode stream serialises rows, so on-disk order
    // matches write order.
    expect(parsed.map((r) => r.raw)).toEqual(['frame-0', 'frame-1', 'frame-2']);
    expect(parsed.every((r) => r.source === 'AisStream')).toBe(true);
  });

  it('preserves write order under a 500-row burst', async () => {
    const writer = new DeadLetterWriter({ path: target });
    for (let i = 0; i < 500; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    await writer.flush();
    await writer.close();
    const raws = readRows(target).map((r) => r.raw);
    expect(raws).toEqual(Array.from({ length: 500 }, (_, i) => `frame-${i}`));
    expect(writer.stats()).toMatchObject({
      failed: false,
      written: 500,
      pending: 0,
      droppedByBackpressure: 0,
    });
  });

  it('flush resolves only after every scheduled row is on disk', async () => {
    const writer = new DeadLetterWriter({ path: target });
    for (let i = 0; i < 50; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    await writer.flush();
    expect(readRows(target)).toHaveLength(50);
    expect(writer.stats().pending).toBe(0);
    await writer.close();
  });

  it('serialises a semantic reject reason with its payload', async () => {
    const writer = new DeadLetterWriter({ path: target });
    writer.write({
      raw: '!AIVDM,1,1,,A,xxx,0*00',
      sourceId: SourceId.WebSdr,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'invalid-mmsi', value: 100_000_000 },
    });
    await writer.flush();
    await writer.close();
    const row = parseRow(readFileSync(target, 'utf8').trim());
    expect(row.reason).toEqual({ kind: 'invalid-mmsi', value: 100_000_000 });
    expect(row.source).toBe('WebSdr');
  });

  it('creates the parent directory if it does not exist', async () => {
    const nested = path.join(tmp, 'nested', 'deep', 'rejected.jsonl');
    const writer = new DeadLetterWriter({ path: nested });
    writer.write({
      raw: 'frame',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'bad-checksum', detail: 'x' },
    });
    await writer.flush();
    await writer.close();
    expect(readFileSync(nested, 'utf8').trim().length).toBeGreaterThan(0);
  });

  it('rotates to .old when the file exceeds maxBytes', async () => {
    const writer = new DeadLetterWriter({
      path: target,
      maxBytes: 200,
      rotateCheckEvery: 2,
    });
    for (let i = 0; i < 12; i += 1) {
      writer.write({
        raw: `frame-${i}-with-some-padding-to-grow-the-file-faster-${'x'.repeat(40)}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    await writer.flush();
    await writer.close();
    expect(existsSync(`${target}.old`)).toBe(true);
    expect(readFileSync(target, 'utf8').length).toBeGreaterThan(0);
  });

  it('rotation swaps files without losing in-flight rows', async () => {
    const writer = new DeadLetterWriter({
      path: target,
      maxBytes: 4000,
      rotateCheckEvery: 5,
    });
    const total = 40;
    for (let i = 0; i < total; i += 1) {
      writer.write({
        raw: `frame-${String(i).padStart(3, '0')}-${'x'.repeat(100)}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    await writer.flush();
    await writer.close();
    expect(existsSync(`${target}.old`)).toBe(true);
    const combined = [...readRows(`${target}.old`), ...readRows(target)];
    // Rows arriving while the stream is closing / renaming are held in
    // the internal buffer and land in the fresh file: nothing lost,
    // order preserved across the boundary.
    expect(combined.map((r) => r.raw)).toEqual(
      Array.from(
        { length: total },
        (_, i) => `frame-${String(i).padStart(3, '0')}-${'x'.repeat(100)}`,
      ),
    );
    expect(writer.stats()).toMatchObject({
      written: total,
      droppedByBackpressure: 0,
    });
  });

  it('drops and counts rows once the backpressure buffer cap is hit', async () => {
    const writer = new DeadLetterWriter({
      path: target,
      // Tiny stream buffer: the first write flips the stream into
      // backpressure, so every subsequent synchronous write queues.
      highWaterMark: 1,
      maxBufferedRows: 2,
    });
    for (let i = 0; i < 5; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    // frame-0 went to the stream, frame-1/frame-2 fill the buffer,
    // frame-3/frame-4 are dropped.
    expect(writer.stats().droppedByBackpressure).toBe(2);
    await writer.flush();
    await writer.close();
    expect(readRows(target).map((r) => r.raw)).toEqual([
      'frame-0',
      'frame-1',
      'frame-2',
    ]);
    expect(writer.stats()).toMatchObject({
      failed: false,
      written: 3,
      pending: 0,
      droppedByBackpressure: 2,
    });
  });

  it('latches exactly once with context when the stream errors', async () => {
    const onLatch = jest.fn();
    // Pointing the writer at a directory makes the stream open fail
    // with EISDIR, surfaced as a stream 'error' event.
    const writer = new DeadLetterWriter({ path: tmp, onLatch });
    writer.write({
      raw: 'frame-0',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_000,
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    await writer.flush();
    writer.write({
      raw: 'frame-1',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_001,
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    await writer.flush();
    expect(onLatch).toHaveBeenCalledTimes(1);
    expect(onLatch).toHaveBeenCalledWith('stream', expect.anything());
    expect(writer.stats()).toMatchObject({ failed: true, pending: 0 });
    await writer.close();
  });

  it('close() drains everything scheduled before the call', async () => {
    const writer = new DeadLetterWriter({ path: target });
    for (let i = 0; i < 10; i += 1) {
      writer.write({
        raw: `frame-${i}`,
        sourceId: SourceId.LocalUdp,
        receivedAt: 1_700_000_000_000 + i,
        reason: { kind: 'bad-checksum', detail: 'mismatch' },
      });
    }
    await writer.close();
    expect(readRows(target)).toHaveLength(10);
    // Writes after close are ignored; close is idempotent.
    writer.write({
      raw: 'late',
      sourceId: SourceId.LocalUdp,
      receivedAt: 1_700_000_000_100,
      reason: { kind: 'bad-checksum', detail: 'mismatch' },
    });
    await writer.close();
    expect(readRows(target)).toHaveLength(10);
  });
});
