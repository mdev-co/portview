import { extractCn } from './edge-bridge.source';

describe('extractCn', () => {
  it('returns CN string from a well-formed peer cert subject', () => {
    expect(extractCn({ subject: { CN: 'device-001' } })).toBe('device-001');
  });

  it('returns null when subject is missing', () => {
    expect(extractCn({})).toBeNull();
  });

  it('returns null when CN is missing from subject', () => {
    expect(extractCn({ subject: {} })).toBeNull();
  });

  it('returns null when CN is empty string', () => {
    expect(extractCn({ subject: { CN: '' } })).toBeNull();
  });

  it('returns null when CN is not a string', () => {
    expect(extractCn({ subject: { CN: 12345 } })).toBeNull();
    expect(extractCn({ subject: { CN: null } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractCn(null)).toBeNull();
    expect(extractCn(undefined)).toBeNull();
    expect(extractCn('certificate-as-string')).toBeNull();
  });
});
