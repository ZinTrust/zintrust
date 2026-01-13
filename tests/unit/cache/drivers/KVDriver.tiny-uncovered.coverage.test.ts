import { describe, expect, it, vi } from 'vitest';

import type { Mock } from 'vitest';

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getKVBinding: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: vi.fn(),
  },
}));

describe('KVDriver (tiny uncovered)', () => {
  it('get returns null when KV binding missing', async () => {
    const { Cloudflare } = await import('@config/cloudflare');
    (Cloudflare.getKVBinding as unknown as Mock).mockReturnValue(null);

    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = KVDriver.create();

    await expect(driver.get('k')).resolves.toBeNull();
  });

  it('set applies min TTL=60 and uses put()', async () => {
    const { Cloudflare } = await import('@config/cloudflare');

    const kv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    (Cloudflare.getKVBinding as unknown as Mock).mockReturnValue(kv);

    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = KVDriver.create();

    await driver.set('k', { a: 1 }, 1);

    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), { expirationTtl: 60 });
  });
});
