import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { $vessels, type LiveVessel } from '@/modules/telemetry';

/**
 * Wrap a `listen`-style subscription so that downstream `onCommit`
 * fires at most once per `windowMs`, with a trailing-edge schedule:
 * the first incoming change schedules the timer, every subsequent
 * change before the timer fires is folded into the same commit. Pure
 * function so the throttle behaviour is testable without a React tree.
 */
export function createThrottledListener(
  listen: (callback: () => void) => () => void,
  onCommit: () => void,
  windowMs: number,
): () => void {
  let scheduled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timeoutId = null;
    scheduled = false;
    onCommit();
  };

  const unsub = listen(() => {
    if (scheduled) return;
    scheduled = true;
    timeoutId = setTimeout(flush, windowMs);
  });

  return () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    unsub();
  };
}

/**
 * Read-side throttle over the live vessel map. The store keeps absorbing
 * frames at ingest rate (10-20 Hz with an active antenna); React only
 * commits at most once per `windowMs`. The trade-off is sidebar
 * staleness up to `windowMs` - 250 ms is well below the AIS broadcast
 * cadence (anchored vessels every 3 min, underway every 2-10 s) so the
 * list never looks behind. Live time tick inside each row uses ref +
 * DOM mutation and is unaffected by this window.
 *
 * Implementation: `useSyncExternalStore` with a ref-backed snapshot.
 * The throttle wraps the source listener so the committed snapshot
 * advances at most once per window; React reads it via `getSnapshot`
 * and re-renders only when the reference changes.
 *
 * The shallow clone on each commit is load-bearing: Nano Stores
 * `map()` mutates the underlying record in place on `setKey` and
 * `$vessels.get()` returns the same object reference across mutations.
 * Cloning here is the only way to give React a fresh reference per
 * throttled commit; without it `useSyncExternalStore` would see the
 * same snapshot and skip every render.
 *
 * `setTimeout` rather than `requestAnimationFrame`: the sidebar does
 * not need frame-aligned updates and a 250 ms window spans many frames
 * regardless. `setTimeout` also keeps firing when the tab is hidden
 * (throttled to ~1 Hz by the browser, but still flowing), so the
 * sidebar stays consistent when the user returns.
 */
export function useThrottledVesselList(windowMs = 250): Record<number, LiveVessel> {
  const committedRef = useRef<Record<number, LiveVessel>>({ ...$vessels.get() });

  const subscribe = useCallback(
    (onChange: () => void) => {
      // Sync committed snapshot with the live store on (re)subscribe
      // so updates that landed between initial render and subscribe
      // are visible on the next React read of `getSnapshot`.
      committedRef.current = { ...$vessels.get() };

      return createThrottledListener(
        callback => $vessels.listen(callback),
        () => {
          committedRef.current = { ...$vessels.get() };
          onChange();
        },
        windowMs,
      );
    },
    [windowMs],
  );

  const getSnapshot = useCallback((): Record<number, LiveVessel> => committedRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Sorted, throttled list view. The sort runs once per throttle commit,
 * memoised on the snapshot reference so a no-op render does not re-sort.
 */
export function useThrottledSortedVesselList(windowMs = 250): readonly LiveVessel[] {
  const snapshot = useThrottledVesselList(windowMs);
  return useMemo(() => {
    const list = Object.values(snapshot);
    list.sort((a, b) => b.timestampUnix - a.timestampUnix);
    return list;
  }, [snapshot]);
}
