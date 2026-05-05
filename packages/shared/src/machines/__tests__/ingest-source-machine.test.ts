import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { ingestSourceMachine } from '../ingest-source-machine';
import {
  DEGRADED_GRACE_MS,
  EXHAUSTED_RETRY_MS,
  HEALTHY_WINDOW_MS,
  type SourceId,
} from '../ingest-source.types';

const PRIORITIZED: readonly SourceId[] = ['local-udp', 'web-sdr', 'ais-stream'];

function makeActor() {
  return createActor(ingestSourceMachine, {
    input: { prioritizedSourceIds: PRIORITIZED },
  });
}

describe('ingestSourceMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle', () => {
    const actor = makeActor();
    actor.start();
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('on START picks the highest-priority source and enters connecting', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('connecting');
    expect(snapshot.context.currentSourceId).toBe('local-udp');
  });

  it('on SOURCE_CONNECTED enters active', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    expect(actor.getSnapshot().value).toBe('active');
  });

  it('ignores SOURCE_CONNECTED for a non-current source', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'ais-stream' });
    expect(actor.getSnapshot().value).toBe('connecting');
  });

  it('records accepted frames in active', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    actor.send({ type: 'FRAME_RECEIVED', sourceId: 'local-udp', frameAt: 1000 });
    actor.send({ type: 'FRAME_RECEIVED', sourceId: 'local-udp', frameAt: 2000 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.framesAccepted).toBe(2);
    expect(ctx.lastFrameAt).toBe(2000);
  });

  it('records rejected frames without leaving active', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    actor.send({ type: 'FRAME_REJECTED', sourceId: 'local-udp', reason: 'bad-checksum' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('active');
    expect(snapshot.context.framesRejected).toBe(1);
  });

  it('transitions to degraded after the healthy window without frames', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    vi.advanceTimersByTime(HEALTHY_WINDOW_MS);
    expect(actor.getSnapshot().value).toBe('degraded');
  });

  it('returns to active when a frame arrives in degraded', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    vi.advanceTimersByTime(HEALTHY_WINDOW_MS);
    actor.send({ type: 'FRAME_RECEIVED', sourceId: 'local-udp', frameAt: 50_000 });
    expect(actor.getSnapshot().value).toBe('active');
  });

  it('frames in active reset the degradation timer', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    vi.advanceTimersByTime(HEALTHY_WINDOW_MS - 1);
    actor.send({ type: 'FRAME_RECEIVED', sourceId: 'local-udp', frameAt: 1 });
    vi.advanceTimersByTime(HEALTHY_WINDOW_MS - 1);
    expect(actor.getSnapshot().value).toBe('active');
  });

  it('after grace period in degraded switches to next priority', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    vi.advanceTimersByTime(HEALTHY_WINDOW_MS);
    vi.advanceTimersByTime(DEGRADED_GRACE_MS);
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('connecting');
    expect(snapshot.context.currentSourceId).toBe('web-sdr');
    expect(snapshot.context.triedSourceIds).toContain('local-udp');
  });

  it('SOURCE_FAILED in connecting moves to next priority', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'local-udp', reason: 'connection refused' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('connecting');
    expect(snapshot.context.currentSourceId).toBe('web-sdr');
    expect(snapshot.context.errorMessage).toBe('connection refused');
  });

  it('exhausted state is reached when all sources fail', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'local-udp', reason: 'fail-1' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'web-sdr', reason: 'fail-2' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'ais-stream', reason: 'fail-3' });
    expect(actor.getSnapshot().value).toBe('exhausted');
  });

  it('after exhausted retry period, restarts from the highest priority', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'local-udp', reason: 'x' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'web-sdr', reason: 'x' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'ais-stream', reason: 'x' });
    expect(actor.getSnapshot().value).toBe('exhausted');
    vi.advanceTimersByTime(EXHAUSTED_RETRY_MS);
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('connecting');
    expect(snapshot.context.currentSourceId).toBe('local-udp');
    expect(snapshot.context.triedSourceIds).toEqual([]);
    expect(snapshot.context.errorMessage).toBeNull();
  });

  it('STOP from active returns to idle', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_CONNECTED', sourceId: 'local-udp' });
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('STOP from exhausted returns to idle', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'local-udp', reason: 'x' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'web-sdr', reason: 'x' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'ais-stream', reason: 'x' });
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('after STOP, START resets tried sources', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SOURCE_FAILED', sourceId: 'local-udp', reason: 'x' });
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().context.triedSourceIds).toContain('local-udp');
    actor.send({ type: 'START' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.triedSourceIds).toEqual([]);
    expect(snapshot.context.currentSourceId).toBe('local-udp');
  });
});
