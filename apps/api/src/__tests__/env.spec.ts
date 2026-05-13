import { getCorsAllowedOrigins, getPort, shouldExposeOpenApi } from '../env';

describe('env', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterAll(() => {
    process.env = original;
  });

  describe('getCorsAllowedOrigins', () => {
    it('returns empty array when env unset', () => {
      delete process.env.CORS_ALLOWED_ORIGINS;
      expect(getCorsAllowedOrigins()).toEqual([]);
    });

    it('returns empty array when env empty string', () => {
      process.env.CORS_ALLOWED_ORIGINS = '';
      expect(getCorsAllowedOrigins()).toEqual([]);
    });

    it('returns a single origin', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://example.com';
      expect(getCorsAllowedOrigins()).toEqual(['https://example.com']);
    });

    it('splits comma-separated origins and trims whitespace', () => {
      process.env.CORS_ALLOWED_ORIGINS =
        'https://a.com, https://b.com ,https://c.com';
      expect(getCorsAllowedOrigins()).toEqual([
        'https://a.com',
        'https://b.com',
        'https://c.com',
      ]);
    });

    it('drops empty entries from a trailing comma', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://a.com,,';
      expect(getCorsAllowedOrigins()).toEqual(['https://a.com']);
    });
  });

  describe('shouldExposeOpenApi', () => {
    it('returns false in production regardless of toggle', () => {
      process.env.NODE_ENV = 'production';
      process.env.SPS_EXPOSE_OPENAPI = 'true';
      expect(shouldExposeOpenApi()).toBe(false);
    });

    it('returns false outside production when toggle missing', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SPS_EXPOSE_OPENAPI;
      expect(shouldExposeOpenApi()).toBe(false);
    });

    it('returns true outside production when toggle exactly "true"', () => {
      process.env.NODE_ENV = 'development';
      process.env.SPS_EXPOSE_OPENAPI = 'true';
      expect(shouldExposeOpenApi()).toBe(true);
    });

    it('returns false on truthy-looking non-"true" values', () => {
      process.env.NODE_ENV = 'development';
      process.env.SPS_EXPOSE_OPENAPI = '1';
      expect(shouldExposeOpenApi()).toBe(false);
    });
  });

  describe('getPort', () => {
    it('defaults to 3000 when PORT unset', () => {
      delete process.env.PORT;
      expect(getPort()).toBe(3000);
    });

    it('parses a positive PORT', () => {
      process.env.PORT = '8080';
      expect(getPort()).toBe(8080);
    });

    it('falls back to default on a non-numeric PORT', () => {
      process.env.PORT = 'abc';
      expect(getPort()).toBe(3000);
    });

    it('falls back to default on a zero or negative PORT', () => {
      process.env.PORT = '0';
      expect(getPort()).toBe(3000);
      process.env.PORT = '-1';
      expect(getPort()).toBe(3000);
    });
  });
});
