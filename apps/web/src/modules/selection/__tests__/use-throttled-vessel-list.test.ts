import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottledListener } from '../hooks/use-throttled-vessel-list';

describe('createThrottledListener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire onCommit before the throttle window elapses', () => {
    const onCommit = vi.fn();
    let emit: () => void = () => {};
    const listen = (callback: () => void): (() => void) => {
      emit = callback;
      return () => {};
    };
    createThrottledListener(listen, onCommit, 250);

    emit();
    vi.advanceTimersByTime(100);
    expect(onCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple emits within one window into a single commit', () => {
    const onCommit = vi.fn();
    let emit: () => void = () => {};
    const listen = (callback: () => void): (() => void) => {
      emit = callback;
      return () => {};
    };
    createThrottledListener(listen, onCommit, 250);

    emit();
    emit();
    emit();
    emit();
    vi.advanceTimersByTime(260);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('schedules a fresh window for the next emit after a commit', () => {
    const onCommit = vi.fn();
    let emit: () => void = () => {};
    const listen = (callback: () => void): (() => void) => {
      emit = callback;
      return () => {};
    };
    createThrottledListener(listen, onCommit, 250);

    emit();
    vi.advanceTimersByTime(260);
    expect(onCommit).toHaveBeenCalledTimes(1);

    emit();
    vi.advanceTimersByTime(260);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('cancels pending commits on dispose and detaches from the source', () => {
    const onCommit = vi.fn();
    const sourceUnsub = vi.fn();
    let emit: () => void = () => {};
    const listen = (callback: () => void): (() => void) => {
      emit = callback;
      return sourceUnsub;
    };
    const dispose = createThrottledListener(listen, onCommit, 250);

    emit();
    dispose();
    vi.advanceTimersByTime(500);

    expect(onCommit).not.toHaveBeenCalled();
    expect(sourceUnsub).toHaveBeenCalledTimes(1);
  });

  it('treats dispose with no pending timer as a clean teardown', () => {
    const onCommit = vi.fn();
    const sourceUnsub = vi.fn();
    const listen = (): (() => void) => {
      return sourceUnsub;
    };
    const dispose = createThrottledListener(listen, onCommit, 250);

    dispose();
    expect(sourceUnsub).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
