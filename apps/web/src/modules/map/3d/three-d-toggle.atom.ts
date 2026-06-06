import { atom } from 'nanostores';

const STORAGE_KEY = 'sps:3d-mode:v1';

/**
 * Operator-controlled toggle for the 3D vessel models. ON by default
 * so the demo lands with the visual wow factor; the operator can
 * flip OFF to recover GPU on a low-end machine. Persisted to
 * localStorage so the choice survives a reload.
 *
 * When OFF the entire 3D layer tears down (DeckGlEngine.detach()),
 * releasing the WebGL2 context resources back to MapLibre's renderer.
 */
function loadInitial(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw !== 'false';
}

export const $threeDMode = atom<boolean>(loadInitial());

export function setThreeDMode(next: boolean): void {
  $threeDMode.set(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Quota or privacy mode - the atom value is still set, the
      // operator just loses persistence for this session.
    }
  }
}
