import { describe, expect, it } from 'vitest';

describe('RuntimeHealthProbes', () => {
  it('returns null when CACHE_DRIVER is not kv', async () => {
    const { RuntimeHealthProbes } = await import('@/health/RuntimeHealthProbes');

    await expect(RuntimeHealthProbes.pingKvCache(50)).resolves.toBeNull();
  });

  it('fails when CACHE_DRIVER=kv and binding is missing', async () => {
    const previousDriver = process.env['CACHE_DRIVER'];
    process.env['CACHE_DRIVER'] = 'kv';

    const previousEnv = (globalThis as unknown as { env?: unknown }).env;
    delete (globalThis as unknown as { env?: unknown }).env;

    const { RuntimeHealthProbes } = await import('@/health/RuntimeHealthProbes');

    await expect(RuntimeHealthProbes.pingKvCache(50)).rejects.toThrow(/binding.*CACHE/i);

    (globalThis as unknown as { env?: unknown }).env = previousEnv;

    if (previousDriver === undefined) delete process.env['CACHE_DRIVER'];
    else process.env['CACHE_DRIVER'] = previousDriver;
  });

  it('succeeds when CACHE_DRIVER=kv and binding is present', async () => {
    const previousDriver = process.env['CACHE_DRIVER'];
    process.env['CACHE_DRIVER'] = 'kv';

    const kv = {
      put: async () => undefined,
      get: async () => ({ ok: true }),
      delete: async () => undefined,
    };

    const previousEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = { CACHE: kv };

    const { RuntimeHealthProbes } = await import('@/health/RuntimeHealthProbes');

    const ms = await RuntimeHealthProbes.pingKvCache(250);
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThanOrEqual(0);

    (globalThis as unknown as { env?: unknown }).env = previousEnv;

    if (previousDriver === undefined) delete process.env['CACHE_DRIVER'];
    else process.env['CACHE_DRIVER'] = previousDriver;
  });
});
