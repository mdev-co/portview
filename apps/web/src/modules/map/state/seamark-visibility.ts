import { atom } from 'nanostores';

/**
 * Global toggle for the OpenSeaMap seamark overlay.
 *
 * The overlay starts hidden; the operator opts in via the seamark
 * toggle. When on, it renders on top of every map style at reduced
 * opacity, gated above zoom 9.
 *
 * Each map style descriptor lists `SEAMARK_OVERLAY_LAYER_ID` in its
 * `overlayLayerIds`, so adding a future mode automatically inherits
 * the overlay capability. The sync hook ANDs the descriptor and this
 * atom: an overlay is visible only when (a) the descriptor lists it
 * AND (b) the toggle is on. Future overlays follow the same pattern.
 */
export const $seamarkVisible = atom<boolean>(false);

export function setSeamarkVisible(value: boolean): void {
  $seamarkVisible.set(value);
}
