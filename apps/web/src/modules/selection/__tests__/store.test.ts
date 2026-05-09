import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $selectedMmsi, clearSelection, selectVessel } from '../store';

describe('selection store', () => {
  beforeEach(() => {
    $selectedMmsi.set(null);
  });

  it('starts with null selection', () => {
    expect($selectedMmsi.get()).toBeNull();
  });

  it('selectVessel sets the atom to the given MMSI', () => {
    selectVessel(261_345_678);
    expect($selectedMmsi.get()).toBe(261_345_678);
  });

  it('clearSelection resets the atom to null', () => {
    selectVessel(261_345_678);
    clearSelection();
    expect($selectedMmsi.get()).toBeNull();
  });

  it('selectVessel is a no-op when the same MMSI is already selected', () => {
    selectVessel(261_345_678);
    const listener = vi.fn();
    const unsubscribe = $selectedMmsi.listen(listener);
    selectVessel(261_345_678);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('clearSelection is a no-op when nothing is selected', () => {
    const listener = vi.fn();
    const unsubscribe = $selectedMmsi.listen(listener);
    clearSelection();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('switches between selected vessels without intermediate null', () => {
    const seen: Array<number | null> = [];
    const unsubscribe = $selectedMmsi.listen(value => seen.push(value));
    selectVessel(261_345_678);
    selectVessel(261_111_111);
    unsubscribe();
    expect(seen).toEqual([261_345_678, 261_111_111]);
  });
});
