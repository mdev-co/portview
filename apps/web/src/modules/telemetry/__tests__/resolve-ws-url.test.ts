import { describe, expect, it } from 'vitest';
import { TELEMETRY_WS_PATH, resolveTelemetryWsUrl } from '../telemetry-client';

describe('resolveTelemetryWsUrl', () => {
  it('returns null for missing override so the caller falls back to defaults', () => {
    expect(resolveTelemetryWsUrl(undefined)).toBeNull();
    expect(resolveTelemetryWsUrl('')).toBeNull();
  });

  it('appends /ws/telemetry to a bare origin', () => {
    expect(resolveTelemetryWsUrl('wss://api.sps-radar.pl')).toBe(
      'wss://api.sps-radar.pl/ws/telemetry',
    );
  });

  it('strips a single trailing slash before appending the path', () => {
    expect(resolveTelemetryWsUrl('wss://api.sps-radar.pl/')).toBe(
      'wss://api.sps-radar.pl/ws/telemetry',
    );
  });

  it('strips repeated trailing slashes', () => {
    expect(resolveTelemetryWsUrl('wss://api.sps-radar.pl///')).toBe(
      'wss://api.sps-radar.pl/ws/telemetry',
    );
  });

  it('is idempotent when the env value already contains /ws/telemetry (legacy contract)', () => {
    // Regression guard for the path-mismatch incident: an env value
    // saved before the refactor MUST still resolve to a working URL
    // so a Vercel rollout that lands the new bundle before the env
    // var is updated does not break production.
    expect(resolveTelemetryWsUrl('wss://api.sps-radar.pl/ws/telemetry')).toBe(
      'wss://api.sps-radar.pl/ws/telemetry',
    );
  });

  it('preserves a non-default port on the origin', () => {
    expect(resolveTelemetryWsUrl('ws://localhost:3000')).toBe('ws://localhost:3000/ws/telemetry');
  });

  it('exposes the canonical path constant so callers and tests share one source of truth', () => {
    expect(TELEMETRY_WS_PATH).toBe('/ws/telemetry');
  });
});
