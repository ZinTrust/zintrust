import { describe, expect, it, vi } from 'vitest';

describe('KVDriver', () => {
  it('behaves safely when KV binding is null', async () => {
    vi.resetModules();

    const warn = vi.fn();
    vi.doMock('@config/logger', () => ({ Logger: { warn } }));
    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getKVBinding: () => null,
      },
    }));

    const mod = await import('@cache/drivers/KVDriver');
    const driver = mod.KVDriver.create();

    // All operations should resolve safely
    await expect(driver.get('x')).resolves.toBeNull();
    await expect(driver.has('x')).resolves.toBe(false);
    await expect(driver.delete('x')).resolves.toBeUndefined();
    await expect(driver.set('x', { foo: 'bar' } as any)).resolves.toBeUndefined();

    // Logger.warn should have been called on set/clear
    expect(warn).toHaveBeenCalled();
  });

  it('uses KV binding when present', async () => {
    vi.resetModules();

    const put = vi.fn(async () => Promise.resolve());
    const get = vi.fn(async (_k: string, opts?: any) => {
      if (opts && opts.type === 'json') return { hello: 'world' };
      return 'raw';
    });
    const del = vi.fn(async () => Promise.resolve());

    vi.doMock('@config/logger', () => ({ Logger: { warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getKVBinding: () => ({ get, put, delete: del }),
      },
    }));

    const mod = await import('@cache/drivers/KVDriver');
    const driver = mod.KVDriver.create();

    await expect(driver.get('k')).resolves.toEqual({ hello: 'world' });
    await expect(driver.has('k')).resolves.toBe(true);
    await expect(driver.set('k', { a: 1 } as any, 10)).resolves.toBeUndefined();
    expect(put).toHaveBeenCalled();
    await expect(driver.delete('k')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalled();
  });
});
