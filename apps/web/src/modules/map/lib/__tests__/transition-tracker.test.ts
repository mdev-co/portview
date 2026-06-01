import { describe, expect, it } from 'vitest';
import { createTransitionTracker } from '../transition-tracker';

const DURATION_MS = 1_500;
const MMSI_A = 211_111_111;
const MMSI_B = 211_222_222;

describe('createTransitionTracker', () => {
  it('starts empty', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    expect(tracker.size()).toBe(0);
  });

  it('adds an entry per mark and grows monotonically', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    expect(tracker.size()).toBe(1);
    tracker.mark(MMSI_B, 0);
    expect(tracker.size()).toBe(2);
  });

  it('re-marking the same mmsi does not grow the tracker', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    tracker.mark(MMSI_A, 250);
    tracker.mark(MMSI_A, 500);
    expect(tracker.size()).toBe(1);
  });

  it('re-marking resets the elapsed-time clock for the mmsi', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    tracker.mark(MMSI_A, 1_000);
    // Without the reset, prune at 1 500 would drop MMSI_A. With the
    // reset, the new start at 1 000 keeps the entry alive until 2 500.
    expect(tracker.pruneCompleted(1_500)).toBe(1);
    expect(tracker.pruneCompleted(2_499)).toBe(1);
    expect(tracker.pruneCompleted(2_500)).toBe(0);
  });

  it('keeps entries inside the window', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    expect(tracker.pruneCompleted(0)).toBe(1);
    expect(tracker.pruneCompleted(750)).toBe(1);
    expect(tracker.pruneCompleted(DURATION_MS - 1)).toBe(1);
  });

  it('prunes entries at or beyond the duration boundary', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    expect(tracker.pruneCompleted(DURATION_MS)).toBe(0);
    expect(tracker.size()).toBe(0);
  });

  it('prunes each entry independently against its own start time', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    tracker.mark(MMSI_B, 800);
    expect(tracker.pruneCompleted(DURATION_MS)).toBe(1);
    expect(tracker.size()).toBe(1);
    expect(tracker.pruneCompleted(800 + DURATION_MS)).toBe(0);
  });

  it('clear empties the tracker', () => {
    const tracker = createTransitionTracker(DURATION_MS);
    tracker.mark(MMSI_A, 0);
    tracker.mark(MMSI_B, 0);
    tracker.clear();
    expect(tracker.size()).toBe(0);
  });

  it('two trackers are independent', () => {
    const a = createTransitionTracker(DURATION_MS);
    const b = createTransitionTracker(DURATION_MS);
    a.mark(MMSI_A, 0);
    expect(a.size()).toBe(1);
    expect(b.size()).toBe(0);
  });
});
