import { useEffect, useReducer } from 'react';
import type { VesselStatus } from '@/modules/map/styles/vessel-palette';
import { $vessels } from '@/modules/telemetry';
import { deriveVesselStatus } from '../lib/derive-status';
import type { VesselGroup } from './use-grouped-vessel-list';

type ExpansionOverrides = Partial<Record<VesselStatus, boolean>>;

type ExpansionAction =
  | { readonly type: 'toggle'; readonly status: VesselStatus }
  | { readonly type: 'select'; readonly status: VesselStatus };

export type SidebarGroupExpansion = {
  /** Returns whether the given status group is currently expanded. Combines user toggles and selection auto-expansions on top of the render-time default-open rule. */
  readonly isOpen: (status: VesselStatus) => boolean;
  readonly toggleGroup: (status: VesselStatus) => void;
};

/**
 * Per-status expansion state for the sidebar groups. Two explicit
 * actions: 'toggle' for header clicks, 'select' for auto-expansion
 * when a selection lands in a group. The select action is idempotent
 * so an effect-driven dispatch on an already-open group returns the
 * same state reference and never cascades a render.
 *
 * Defaults are derived at render time via `defaultOpenFor` rather
 * than seeded once at mount. The sidebar mounts before the first
 * WebSocket frames arrive, so a mount-time seed runs against an
 * empty `groups` array and the default-open rule ("first group open;
 * both open if two or fewer") would be silently lost. Render-time
 * derivation keeps the rule honest while the reducer only holds the
 * user's explicit toggles plus selection auto-expansions.
 *
 * The hook owns the state machine and the effect that watches the
 * selected mmsi. The component consumes `isOpen` and `toggleGroup`
 * as a pure-render contract; it holds no expansion logic of its own.
 */
export function useSidebarGroupExpansion(
  groups: readonly VesselGroup[],
  selectedMmsi: number | null,
): SidebarGroupExpansion {
  const [overrides, dispatch] = useReducer(reducer, EMPTY_OVERRIDES);

  // Look up the selected vessel directly from the store instead of
  // walking `groups`. `groups` is recomputed on every WebSocket batch
  // (new array reference even when membership is unchanged), so
  // including it in the dependency list would re-fire this effect
  // many times per second and walk the groups for nothing. Dispatch
  // remains idempotent so a spurious fire is a no-op.
  useEffect(() => {
    if (selectedMmsi === null) return;
    const vessel = $vessels.get()[selectedMmsi];
    if (vessel === undefined) return;
    dispatch({ type: 'select', status: deriveVesselStatus(vessel) });
  }, [selectedMmsi]);

  return {
    isOpen: status => overrides[status] ?? defaultOpenFor(status, groups),
    toggleGroup: status => dispatch({ type: 'toggle', status }),
  };
}

const EMPTY_OVERRIDES: ExpansionOverrides = {};

/**
 * Render-time default-open rule. The first group is open; if there
 * are at most two groups, both are open. Beyond that, only the first.
 * Status not present in `groups` defaults to closed.
 */
export function defaultOpenFor(
  status: VesselStatus,
  groups: readonly { readonly status: VesselStatus }[],
): boolean {
  const index = groups.findIndex(group => group.status === status);
  if (index < 0) return false;
  return index === 0 || groups.length <= 2;
}

export function reducer(state: ExpansionOverrides, action: ExpansionAction): ExpansionOverrides {
  if (action.type === 'toggle') {
    return { ...state, [action.status]: !(state[action.status] ?? false) };
  }
  // 'select' is idempotent: returning the same reference when the
  // target group is already open lets React skip the re-render that
  // would otherwise follow an effect-driven dispatch.
  if (state[action.status]) return state;
  return { ...state, [action.status]: true };
}
