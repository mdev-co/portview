import { atom, computed } from 'nanostores';

/**
 * Tab visibility domain store.
 *
 * Browsers throttle (Chrome / Firefox) or fully suspend (Safari battery
 * saver, mobile) background tabs after some idle period. While the tab
 * is suspended the WebSocket connection may stay open server-side but
 * the client processes no messages, so the in-memory `$vessels` store
 * stops receiving timestamp refreshes. On return to the foreground the
 * 30 s `sweepStale` interval catches up and evicts every vessel whose
 * last update is older than the 600 s TTL window - the user sees an
 * almost-empty sidebar that "magically refills" only after a manual
 * reload. This store closes that loop for any consumer that cares.
 *
 * Pattern (kept uniform with the rest of the project):
 *  - One `atom` carries the current state plus the previous-transition
 *    metadata that downstream consumers (telemetry-client today; a
 *    future "Reconnecting..." banner, an rAF pauser, analytics events,
 *    etc.) can derive from.
 *  - A named `transitionTo` function performs every write so mutations
 *    are auditable in a stack trace and tests can drive transitions
 *    without a DOM at all.
 *  - `computed` derived atoms (e.g. `$isTabHidden`) carry the
 *    single-bit views the React layer typically wants, so a component
 *    subscribes only to what it renders against.
 *  - Module-load DOM wiring is the only side effect at import time and
 *    is guarded for SSR / non-browser test environments.
 *
 * Upgrade path to XState: when the lifecycle stabilises into >= 3 named
 * states with explicit transitions (e.g. visible / hidden / suspended
 * / reconnecting), refactor this atom into a ConnectionMachine actor
 * and keep `$isTabHidden` (and friends) as the read-side interface so
 * downstream consumers do not break.
 */

export type TabVisibilityState =
  | {
      readonly kind: 'visible';
      readonly enteredAt: number;
      readonly prevHiddenDurationMs: number;
    }
  | {
      readonly kind: 'hidden';
      readonly enteredAt: number;
    };

function initialState(): TabVisibilityState {
  const now = Date.now();
  const kind: 'visible' | 'hidden' =
    typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 'hidden' : 'visible';
  if (kind === 'hidden') {
    return { kind, enteredAt: now };
  }
  return { kind: 'visible', enteredAt: now, prevHiddenDurationMs: 0 };
}

export const $tabVisibility = atom<TabVisibilityState>(initialState());

/**
 * Single write surface. Tests call it directly; the DOM listener below
 * calls it from `visibilitychange`. Idempotent within the same kind
 * (no churn on duplicate events some browsers occasionally fire on
 * window blur / focus combos).
 */
export function transitionTo(nextKind: 'visible' | 'hidden', now: number = Date.now()): void {
  const prev = $tabVisibility.get();
  if (prev.kind === nextKind) return;
  if (nextKind === 'hidden') {
    $tabVisibility.set({ kind: 'hidden', enteredAt: now });
    return;
  }
  $tabVisibility.set({
    kind: 'visible',
    enteredAt: now,
    prevHiddenDurationMs: now - prev.enteredAt,
  });
}

/** Single-bit view for components that only need "are we hidden". */
export const $isTabHidden = computed($tabVisibility, state => state.kind === 'hidden');

/**
 * Duration the tab has been in its current state, in milliseconds.
 * Recomputed every read because it depends on the wall clock; callers
 * are expected to read on demand (e.g. on a `.listen` callback) rather
 * than treating this as a continuously updated value.
 */
export function currentStateDurationMs(now: number = Date.now()): number {
  return now - $tabVisibility.get().enteredAt;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    transitionTo(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
  });
}

export const __test = {
  reset(): void {
    $tabVisibility.set(initialState());
  },
  transitionTo,
};
