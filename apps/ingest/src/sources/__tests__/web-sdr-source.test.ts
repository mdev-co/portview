import { describe, expect, it } from 'vitest';
import { WebSdrSource } from '../web-sdr-source';

describe('WebSdrSource', () => {
  it('exposes the configured source id and priority', () => {
    const source = new WebSdrSource();
    expect(source.id).toBe('web-sdr');
    expect(source.priority).toBe(2);
  });

  it('start rejects because the source is not yet implemented', async () => {
    const source = new WebSdrSource();
    await expect(source.start()).rejects.toThrow(/not yet implemented/);
  });

  it('stop resolves without side effects', async () => {
    const source = new WebSdrSource();
    await expect(source.stop()).resolves.toBeUndefined();
  });

  it('onFrame returns an unsubscribe that does not throw', () => {
    const source = new WebSdrSource();
    const unsub = source.onFrame(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('onError returns an unsubscribe that does not throw', () => {
    const source = new WebSdrSource();
    const unsub = source.onError(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
