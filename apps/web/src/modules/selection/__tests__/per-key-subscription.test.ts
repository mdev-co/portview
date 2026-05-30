import { $disabledTrailMmsis, toggleTrailForVessel } from '@/modules/map/state/trail-visibility';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerKeyListener } from '../lib/per-key-listener';

const MMSI_TARGET = 211_111_111;
const MMSI_OTHER = 211_222_222;

/**
 * `createPerKeyListener` is the shared closure used by every per-MMSI
 * subscription hook (`useTrailEnabledForMmsi`, `useVesselStatic`,
 * `useSelectedVessel`). These tests pin the equality-guarded fan-out
 * behaviour directly against a live store. Hooks compose this helper
 * with `useSyncExternalStore`; their React-level behaviour is the
 * helper's behaviour plus React's snapshot equality.
 */
describe('createPerKeyListener over $disabledTrailMmsis', () => {
  beforeEach(() => {
    $disabledTrailMmsis.set(new Set());
  });

  it('does not fire when another mmsi is toggled', () => {
    const onChange = vi.fn();
    const initial = !$disabledTrailMmsis.get().has(MMSI_TARGET);
    const unsub = createPerKeyListener(
      $disabledTrailMmsis,
      initial,
      snapshot => !snapshot.has(MMSI_TARGET),
      onChange,
    );

    toggleTrailForVessel(MMSI_OTHER);
    toggleTrailForVessel(MMSI_OTHER);
    unsub();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires once when the target mmsi flips from enabled to disabled', () => {
    const onChange = vi.fn();
    const initial = !$disabledTrailMmsis.get().has(MMSI_TARGET);
    const unsub = createPerKeyListener(
      $disabledTrailMmsis,
      initial,
      snapshot => !snapshot.has(MMSI_TARGET),
      onChange,
    );

    toggleTrailForVessel(MMSI_TARGET);
    unsub();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires again when the target mmsi flips back from disabled to enabled', () => {
    const onChange = vi.fn();
    const initial = !$disabledTrailMmsis.get().has(MMSI_TARGET);
    const unsub = createPerKeyListener(
      $disabledTrailMmsis,
      initial,
      snapshot => !snapshot.has(MMSI_TARGET),
      onChange,
    );

    toggleTrailForVessel(MMSI_TARGET);
    toggleTrailForVessel(MMSI_TARGET);
    unsub();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('drops the source subscription on unsub and stops firing', () => {
    const onChange = vi.fn();
    const initial = !$disabledTrailMmsis.get().has(MMSI_TARGET);
    const unsub = createPerKeyListener(
      $disabledTrailMmsis,
      initial,
      snapshot => !snapshot.has(MMSI_TARGET),
      onChange,
    );

    unsub();
    toggleTrailForVessel(MMSI_TARGET);

    expect(onChange).not.toHaveBeenCalled();
  });
});
