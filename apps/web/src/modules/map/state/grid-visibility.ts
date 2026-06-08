import { atom } from 'nanostores';

const STORAGE_KEY = 'sps.grid.visible';

/**
 * Global coordinate-grid overlay visibility. Independent of the active
 * basemap style — the operator can flip the cyan presentation grid on
 * over any chart (OSM, USGS, Tactical, Satellite, Presentation, etc).
 * Persists across reloads via `localStorage`.
 *
 * Default OFF so the first paint stays minimal; an operator who wants
 * a coordinate reticle flips it on once and it stays on.
 */
function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const $gridVisible = atom<boolean>(readInitial());

export function setGridVisible(value: boolean): void {
  $gridVisible.set(value);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // localStorage unavailable (private mode, quota) — atom still works
    // for the current session, persistence simply skipped.
  }
}
