type ReadableStore<TSnapshot> = {
  readonly get: () => TSnapshot;
  readonly listen: (callback: (snapshot: TSnapshot) => void) => () => void;
};

/**
 * Subscribe to a Nano Stores `map()`-style source, but only invoke
 * `onChange` when the projection at the watched key actually differs
 * from the last seen value. Returns the source unsubscribe so the
 * caller drives lifecycle. Pure function with no React dependency so
 * the equality-guarded behaviour is testable in isolation and shared
 * between the per-mmsi hooks (`useTrailEnabledForMmsi`, future per-key
 * subscribers).
 *
 * The `read` projection is invoked with each incoming snapshot; the
 * closure retains the previous projection result and compares with
 * strict equality. Callers that need referential identity (a per-key
 * record entry) pass `snapshot[key]`; callers that need a derived
 * primitive (a boolean membership check) pass an inline projection.
 */
export function createPerKeyListener<TSnapshot, TValue>(
  store: ReadableStore<TSnapshot>,
  initial: TValue,
  read: (snapshot: TSnapshot) => TValue,
  onChange: () => void,
): () => void {
  let last = initial;
  return store.listen(snapshot => {
    const next = read(snapshot);
    if (next !== last) {
      last = next;
      onChange();
    }
  });
}
