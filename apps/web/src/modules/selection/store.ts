import { atom } from 'nanostores';

export const $selectedMmsi = atom<number | null>(null);

export function selectVessel(mmsi: number): void {
  if ($selectedMmsi.get() === mmsi) return;
  $selectedMmsi.set(mmsi);
}

export function clearSelection(): void {
  if ($selectedMmsi.get() === null) return;
  $selectedMmsi.set(null);
}
