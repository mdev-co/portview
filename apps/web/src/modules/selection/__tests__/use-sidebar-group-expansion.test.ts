import type { VesselStatus } from '@/modules/map/styles/vessel-palette';
import { describe, expect, it } from 'vitest';
import type { VesselGroup } from '../hooks/use-grouped-vessel-list';
import { defaultOpenFor, reducer } from '../hooks/use-sidebar-group-expansion';

const group = (status: VesselStatus): VesselGroup => ({ status, items: [] });

describe('defaultOpenFor', () => {
  it('returns false when the status is not present in groups (cold start)', () => {
    expect(defaultOpenFor('underway', [])).toBe(false);
  });

  it('opens the only group when one is present', () => {
    expect(defaultOpenFor('underway', [group('underway')])).toBe(true);
  });

  it('opens both groups when two are present', () => {
    const groups = [group('underway'), group('anchored')];
    expect(defaultOpenFor('underway', groups)).toBe(true);
    expect(defaultOpenFor('anchored', groups)).toBe(true);
  });

  it('opens only the first group when three or more are present', () => {
    const groups = [group('underway'), group('anchored'), group('stopped'), group('nuc')];
    expect(defaultOpenFor('underway', groups)).toBe(true);
    expect(defaultOpenFor('anchored', groups)).toBe(false);
    expect(defaultOpenFor('stopped', groups)).toBe(false);
    expect(defaultOpenFor('nuc', groups)).toBe(false);
  });
});

describe('reducer', () => {
  it('toggle adds an override flipping the implicit default', () => {
    expect(reducer({}, { type: 'toggle', status: 'underway' })).toEqual({ underway: true });
  });

  it('toggle on an existing override flips it', () => {
    expect(reducer({ underway: true }, { type: 'toggle', status: 'underway' })).toEqual({
      underway: false,
    });
  });

  it('toggle preserves other overrides', () => {
    const initial = { underway: true, anchored: false } as const;
    expect(reducer(initial, { type: 'toggle', status: 'anchored' })).toEqual({
      underway: true,
      anchored: true,
    });
  });

  it('select opens a closed override', () => {
    const initial = { underway: false } as const;
    expect(reducer(initial, { type: 'select', status: 'underway' })).toEqual({ underway: true });
  });

  it('select on a status without an override opens it', () => {
    expect(reducer({}, { type: 'select', status: 'stopped' })).toEqual({ stopped: true });
  });

  it('select returns the same reference when the override is already true (idempotent)', () => {
    const initial = { underway: true, anchored: false } as const;
    const next = reducer(initial, { type: 'select', status: 'underway' });
    expect(next).toBe(initial);
  });
});
