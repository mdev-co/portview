import { describe, expect, it } from 'vitest';
import { isValidLatLng, validateLatLng } from '../coordinates';

describe('isValidLatLng', () => {
  it('accepts the southern lat boundary', () => {
    expect(isValidLatLng([0, -90])).toBe(true);
  });

  it('accepts the northern lat boundary', () => {
    expect(isValidLatLng([0, 90])).toBe(true);
  });

  it('accepts the western lng boundary', () => {
    expect(isValidLatLng([-180, 0])).toBe(true);
  });

  it('accepts the eastern lng boundary', () => {
    expect(isValidLatLng([180, 0])).toBe(true);
  });

  it('rejects lat below -90', () => {
    expect(isValidLatLng([0, -91])).toBe(false);
  });

  it('rejects lat above 90', () => {
    expect(isValidLatLng([0, 91])).toBe(false);
  });

  it('rejects lng below -180', () => {
    expect(isValidLatLng([-181, 0])).toBe(false);
  });

  it('rejects lng above 180', () => {
    expect(isValidLatLng([181, 0])).toBe(false);
  });

  it('rejects NaN values', () => {
    expect(isValidLatLng([Number.NaN, 0])).toBe(false);
    expect(isValidLatLng([0, Number.NaN])).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isValidLatLng([Number.POSITIVE_INFINITY, 0])).toBe(false);
    expect(isValidLatLng([0, Number.NEGATIVE_INFINITY])).toBe(false);
  });

  it('accepts a typical Szczecin location', () => {
    expect(isValidLatLng([14.5528, 53.4285])).toBe(true);
  });
});

describe('validateLatLng', () => {
  it('returns ok with the position on success', () => {
    const result = validateLatLng([14.5528, 53.4285]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([14.5528, 53.4285]);
  });

  it('returns out-of-range-lat for an out-of-range latitude', () => {
    const result = validateLatLng([0, 91]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('out-of-range-lat');
      if (result.error.kind === 'out-of-range-lat') expect(result.error.value).toBe(91);
    }
  });

  it('returns out-of-range-lng for an out-of-range longitude', () => {
    const result = validateLatLng([181, 0]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('out-of-range-lng');
      if (result.error.kind === 'out-of-range-lng') expect(result.error.value).toBe(181);
    }
  });
});
