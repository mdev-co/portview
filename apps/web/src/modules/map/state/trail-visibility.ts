import { $selectedMmsi } from '@/modules/selection';
import { atom, computed } from 'nanostores';

/**
 * Trail visibility model.
 *
 * Defaults to selection-only: clicking a vessel in the sidebar or on
 * the map paints its trail; deselecting clears it. Two opt-in switches
 * extend that baseline:
 *
 *  - `$showAllTrails` (global, default off) - paint every vessel's
 *    trail. Useful for the "who came from where" overview, busy on the
 *    map by default.
 *  - `$disabledTrailMmsis` (per-vessel suppress, default empty) - the
 *    operator can untick a specific vessel's trail even if it would
 *    otherwise be shown (selection or global on). Mirrors the
 *    per-vessel disable checkbox in the sidebar details.
 *
 * The composed predicate `shouldShowTrail(mmsi)` lives behind a
 * computed atom so the map render path receives a stable function
 * reference across ticks.
 */
export const $showAllTrails = atom<boolean>(false);

export const $disabledTrailMmsis = atom<ReadonlySet<number>>(new Set());

export function setShowAllTrails(value: boolean): void {
  $showAllTrails.set(value);
}

export function toggleTrailForVessel(mmsi: number): void {
  const current = $disabledTrailMmsis.get();
  const next = new Set(current);
  if (next.has(mmsi)) {
    next.delete(mmsi);
  } else {
    next.add(mmsi);
  }
  $disabledTrailMmsis.set(next);
}

/** True when the operator has explicitly suppressed this vessel's trail. */
export function isTrailDisabledFor(mmsi: number): boolean {
  return $disabledTrailMmsis.get().has(mmsi);
}

/**
 * Computed predicate read by the trail GeoJSON builder. Wrapped in a
 * computed atom so subscribers (map render tick) get a single source
 * of truth that re-emits only when any input changes.
 */
export const $trailVisibilityPredicate = computed(
  [$showAllTrails, $disabledTrailMmsis, $selectedMmsi],
  (showAll, disabled, selectedMmsi) => {
    return (mmsi: number): boolean => {
      if (disabled.has(mmsi)) return false;
      if (showAll) return true;
      return selectedMmsi === mmsi;
    };
  },
);
