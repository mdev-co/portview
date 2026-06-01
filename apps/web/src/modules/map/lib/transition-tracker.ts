type TransitionTracker = {
  /** Mark `mmsi` as transitioning. Resets the start timestamp if called again before the previous transition completes. */
  readonly mark: (mmsi: number, nowMs: number) => void;
  /** Drop entries whose `nowMs - startedAtMs >= durationMs`. Returns the remaining count for the caller to decide whether to render. */
  readonly pruneCompleted: (nowMs: number) => number;
  /** Current count of in-flight transitions. */
  readonly size: () => number;
  /** Wipe state; call from layer cleanup. */
  readonly clear: () => void;
};

/**
 * Track per-MMSI transition windows so a render loop can skip work
 * when nothing is animating. Pure module so the behaviour can be
 * exercised without a React tree or MapLibre runtime.
 *
 * `durationMs` is the lerp duration applied by
 * `dead-reckoning-tracker.smoothedDisplayPosition`. The two are
 * intentionally kept in lockstep: the vessel layer rebuilds while
 * any transition has time remaining; the tracker settles the
 * displayed coordinate on the same schedule. See ADR-0022.
 */
export function createTransitionTracker(durationMs: number): TransitionTracker {
  const transitions = new Map<number, number>();

  return {
    mark(mmsi: number, nowMs: number): void {
      transitions.set(mmsi, nowMs);
    },
    pruneCompleted(nowMs: number): number {
      for (const [mmsi, startedAtMs] of transitions) {
        if (nowMs - startedAtMs >= durationMs) {
          transitions.delete(mmsi);
        }
      }
      return transitions.size;
    },
    size(): number {
      return transitions.size;
    },
    clear(): void {
      transitions.clear();
    },
  };
}
