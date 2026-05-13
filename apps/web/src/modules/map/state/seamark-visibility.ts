import { atom } from 'nanostores';

/**
 * Global toggle for the OpenSeaMap seamark overlay.
 *
 * Each map style descriptor lists `overlay-seamark` in its
 * `overlayLayerIds`, so by default seamarks render on every mode at
 * reduced opacity (gated above zoom 9). This atom lets the operator
 * suppress the overlay entirely - useful on the Voyager base where
 * the chart's own labels already convey enough port context and the
 * extra seamark symbols become visual noise.
 *
 * The sync hook ANDs the descriptor and this atom: an overlay is
 * visible only when (a) the descriptor lists it AND (b) the toggle
 * is on. Future overlays would follow the same pattern.
 */
export const $seamarkVisible = atom<boolean>(false);

export function setSeamarkVisible(value: boolean): void {
  $seamarkVisible.set(value);
}
