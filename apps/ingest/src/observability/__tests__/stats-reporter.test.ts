import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceId } from '@sps/shared';
import { type IngestStatsSnapshot, startStatsReporter } from '../stats-reporter';

const SAMPLE: IngestStatsSnapshot = {
  machineState: 'active',
  currentSourceId: SourceId.LocalUdp,
  framesAccepted: 0,
  framesRejected: 0,
  perSource: [],
};

describe('startStatsReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not emit before the first interval elapses', () => {
    const emit = vi.fn();
    const stop = startStatsReporter({ fetch: () => SAMPLE, emit, intervalMs: 5_000 });
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_999);
    expect(emit).not.toHaveBeenCalled();
    stop();
  });

  it('emits exactly once per interval', () => {
    const emit = vi.fn();
    const stop = startStatsReporter({ fetch: () => SAMPLE, emit, intervalMs: 5_000 });
    vi.advanceTimersByTime(5_000);
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(emit).toHaveBeenCalledTimes(4);
    stop();
  });

  it('passes the current snapshot to emit each tick', () => {
    let counter = 0;
    const emit = vi.fn();
    const stop = startStatsReporter({
      fetch: () => ({ ...SAMPLE, framesAccepted: ++counter }),
      emit,
      intervalMs: 1_000,
    });
    vi.advanceTimersByTime(3_000);
    const calls = emit.mock.calls.map(c => (c[0] as IngestStatsSnapshot).framesAccepted);
    expect(calls).toEqual([1, 2, 3]);
    stop();
  });

  it('stops emitting after returned function is called', () => {
    const emit = vi.fn();
    const stop = startStatsReporter({ fetch: () => SAMPLE, emit, intervalMs: 1_000 });
    vi.advanceTimersByTime(2_000);
    expect(emit).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('uses default 30s interval when not provided', () => {
    const emit = vi.fn();
    const stop = startStatsReporter({ fetch: () => SAMPLE, emit });
    vi.advanceTimersByTime(29_999);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    stop();
  });
});
