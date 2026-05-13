import { afterEach, describe, expect, it, vi } from 'vitest';
import { unregisterStaleServiceWorkers } from '../sw-cleanup';

type FakeRegistration = {
  unregister: ReturnType<typeof vi.fn>;
};

function stubServiceWorker(registrations: FakeRegistration[]): void {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistrations: vi.fn().mockResolvedValue(registrations),
    },
  });
}

function removeServiceWorker(): void {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
  delete (globalThis.navigator as unknown as Record<string, unknown>).serviceWorker;
}

describe('unregisterStaleServiceWorkers', () => {
  afterEach(() => {
    removeServiceWorker();
    vi.restoreAllMocks();
  });

  it('unregisters every registration the navigator reports', async () => {
    const reg1: FakeRegistration = { unregister: vi.fn() };
    const reg2: FakeRegistration = { unregister: vi.fn() };
    stubServiceWorker([reg1, reg2]);

    unregisterStaleServiceWorkers();
    await Promise.resolve();
    await Promise.resolve();

    expect(reg1.unregister).toHaveBeenCalledTimes(1);
    expect(reg2.unregister).toHaveBeenCalledTimes(1);
  });

  it('no-ops when getRegistrations returns empty', async () => {
    stubServiceWorker([]);
    expect(() => {
      unregisterStaleServiceWorkers();
    }).not.toThrow();
    await Promise.resolve();
  });

  it('swallows getRegistrations rejection without throwing', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('blocked')),
      },
    });
    expect(() => {
      unregisterStaleServiceWorkers();
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('no-ops in browsers without serviceWorker support', () => {
    removeServiceWorker();
    expect(() => {
      unregisterStaleServiceWorkers();
    }).not.toThrow();
  });
});
