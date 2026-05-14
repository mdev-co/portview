import { beforeEach, describe, expect, it } from 'vitest';
import { $isTabHidden, $tabVisibility, __test } from '../tab-visibility.store';

beforeEach(() => {
  __test.reset();
});

describe('tab-visibility.store > transitionTo', () => {
  it('starts in visible state with zero previous-hidden duration', () => {
    const state = $tabVisibility.get();
    expect(state.kind).toBe('visible');
    if (state.kind === 'visible') {
      expect(state.prevHiddenDurationMs).toBe(0);
    }
  });

  it('moves visible -> hidden and stamps enteredAt', () => {
    __test.transitionTo('hidden', 10_000);
    const state = $tabVisibility.get();
    expect(state.kind).toBe('hidden');
    expect(state.enteredAt).toBe(10_000);
  });

  it('records the previous hidden duration on hidden -> visible', () => {
    __test.transitionTo('hidden', 10_000);
    __test.transitionTo('visible', 45_000);
    const state = $tabVisibility.get();
    expect(state.kind).toBe('visible');
    if (state.kind === 'visible') {
      expect(state.prevHiddenDurationMs).toBe(35_000);
      expect(state.enteredAt).toBe(45_000);
    }
  });

  it('is idempotent when the next kind matches the current kind', () => {
    __test.transitionTo('hidden', 5_000);
    const first = $tabVisibility.get();
    __test.transitionTo('hidden', 9_000); // duplicate event from the browser
    const second = $tabVisibility.get();
    expect(second).toBe(first); // same object reference, no churn
  });

  it('handles multiple toggle cycles preserving the most recent prev duration', () => {
    __test.transitionTo('hidden', 1_000);
    __test.transitionTo('visible', 3_000); // hidden 2 s
    __test.transitionTo('hidden', 4_000);
    __test.transitionTo('visible', 60_000); // hidden 56 s
    const state = $tabVisibility.get();
    expect(state.kind).toBe('visible');
    if (state.kind === 'visible') {
      expect(state.prevHiddenDurationMs).toBe(56_000);
    }
  });
});

describe('tab-visibility.store > derived $isTabHidden', () => {
  // The computed selector is what most React consumers actually
  // subscribe to (single-bit view that does not leak the metadata
  // surface). Verifying it tracks the parent atom is part of the
  // contract this module exports.

  it('is false in the initial visible state', () => {
    expect($isTabHidden.get()).toBe(false);
  });

  it('reflects transitions to and from hidden', () => {
    __test.transitionTo('hidden', 100);
    expect($isTabHidden.get()).toBe(true);
    __test.transitionTo('visible', 200);
    expect($isTabHidden.get()).toBe(false);
  });
});
