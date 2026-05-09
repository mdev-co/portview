import { atom } from 'nanostores';

/**
 * MMSI of the vessel currently selected in the UI, or `null` when no
 * selection. Single atom (not a map) — only one vessel can be open in
 * the details panel at a time. Subscribers re-render only on selection
 * change, never on live vessel updates.
 */
export const $selectedMmsi = atom<number | null>(null);

export function selectVessel(mmsi: number): void {
  if ($selectedMmsi.get() === mmsi) return;
  $selectedMmsi.set(mmsi);
}

export function clearSelection(): void {
  if ($selectedMmsi.get() === null) return;
  $selectedMmsi.set(null);
}
