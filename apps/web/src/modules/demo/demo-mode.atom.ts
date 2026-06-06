import { atom } from 'nanostores';

/**
 * Operator-facing demo toggle. When ON the demo controller injects two
 * synthetic vessels into the live telemetry stores at a Class-B-like
 * cadence so a reviewer can see how the smoothing pipeline, 3D model
 * orientation and trail rendering behave on a quiet day when the real
 * port traffic is sparse (Saturday evening, holidays, etc.).
 *
 * NOT persisted to localStorage on purpose: the toggle is a
 * presentation aid, not part of the operator's stable session state.
 * Refreshing the page returns to live-only.
 */
export const $demoMode = atom<boolean>(false);

export function setDemoMode(value: boolean): void {
  $demoMode.set(value);
}
