import { validatePosition } from './position-validator';

describe('validatePosition', () => {
  const base = {
    lat: 53.4267,
    lng: 14.565,
    speedOverGround: 5.3,
    courseOverGround: 90,
    trueHeading: 91,
  };

  it('accepts a valid Szczecin-area position with full kinematics', () => {
    expect(validatePosition(base)).toEqual({ ok: true });
  });

  it('accepts null kinematics (no-fix sentinel for SOG/COG/heading)', () => {
    expect(
      validatePosition({
        ...base,
        speedOverGround: null,
        courseOverGround: null,
        trueHeading: null,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects latitude beyond 90', () => {
    expect(validatePosition({ ...base, lat: 91 })).toEqual({
      ok: false,
      reason: 'lat-out-of-range',
    });
  });

  it('rejects latitude beyond -90', () => {
    expect(validatePosition({ ...base, lat: -90.0001 })).toEqual({
      ok: false,
      reason: 'lat-out-of-range',
    });
  });

  it('rejects longitude beyond 180', () => {
    expect(validatePosition({ ...base, lng: 181 })).toEqual({
      ok: false,
      reason: 'lng-out-of-range',
    });
  });

  it('rejects SOG above AIS maximum 102.2 knots', () => {
    expect(validatePosition({ ...base, speedOverGround: 103 })).toEqual({
      ok: false,
      reason: 'sog-out-of-range',
    });
  });

  it('rejects negative SOG', () => {
    expect(validatePosition({ ...base, speedOverGround: -1 })).toEqual({
      ok: false,
      reason: 'sog-out-of-range',
    });
  });

  it('rejects COG above 360', () => {
    expect(validatePosition({ ...base, courseOverGround: 361 })).toEqual({
      ok: false,
      reason: 'cog-out-of-range',
    });
  });

  it('rejects heading non-integer or above 359', () => {
    expect(validatePosition({ ...base, trueHeading: 360 })).toEqual({
      ok: false,
      reason: 'heading-out-of-range',
    });
    expect(validatePosition({ ...base, trueHeading: 90.5 })).toEqual({
      ok: false,
      reason: 'heading-out-of-range',
    });
  });

  it('rejects NaN or Infinity coordinates', () => {
    expect(validatePosition({ ...base, lat: Number.NaN })).toEqual({
      ok: false,
      reason: 'lat-out-of-range',
    });
    expect(
      validatePosition({ ...base, lng: Number.POSITIVE_INFINITY }),
    ).toEqual({ ok: false, reason: 'lng-out-of-range' });
  });
});
