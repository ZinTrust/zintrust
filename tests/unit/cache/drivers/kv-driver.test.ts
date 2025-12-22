import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerWarn = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    warn: loggerWarn,
  },
}));

type KvMock = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('KVDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Avoid leaking the Workers-style binding between tests
    delete (globalThis as unknown as Record<string, unknown>)['env'];
  });

  it('returns null/false and warns when KV binding missing', async () => {
    delete (globalThis as unknown as Record<string, unknown>)['env'];

    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = new KVDriver();

    await expect(driver.get('k')).resolves.toBeNull();
    await driver.set('k', 'v');
    await expect(driver.has('k')).resolves.toBe(false);
    await expect(driver.delete('k')).resolves.toBeUndefined();

    expect(loggerWarn).toHaveBeenCalledWith('KV binding "CACHE" not found. Cache set ignored.');
  });

  it('uses KV namespace when env.CACHE is present (get/set/delete/has)', async () => {
    const kv: KvMock = {
      get: vi.fn(async () => ({ ok: true })),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };

    (globalThis as unknown as Record<string, unknown>)['env'] = { CACHE: kv };

    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = new KVDriver();

    await expect(driver.get<{ ok: boolean }>('k')).resolves.toEqual({ ok: true });
    expect(kv.get).toHaveBeenCalledWith('k', { type: 'json' });

    await driver.set('k', { a: 1 });
    expect(kv.put).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), {});

    await driver.delete('k');
    expect(kv.delete).toHaveBeenCalledWith('k');

    kv.get.mockResolvedValueOnce(null);
    await expect(driver.has('missing')).resolves.toBe(false);

    kv.get.mockResolvedValueOnce('x');
    await expect(driver.has('exists')).resolves.toBe(true);
  });

  it('applies minimum TTL of 60 seconds', async () => {
    const kv: KvMock = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };

    (globalThis as unknown as Record<string, unknown>)['env'] = { CACHE: kv };

    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = new KVDriver();

    await driver.set('k', 'v', 30);
    expect(kv.put).toHaveBeenCalledWith('k', JSON.stringify('v'), { expirationTtl: 60 });

    await driver.set('k2', 'v2', 120);
    expect(kv.put).toHaveBeenCalledWith('k2', JSON.stringify('v2'), { expirationTtl: 120 });
  });

  it('warns that clear is not implemented', async () => {
    const { KVDriver } = await import('@cache/drivers/KVDriver');
    const driver = new KVDriver();

    await driver.clear();

    expect(loggerWarn).toHaveBeenCalledWith(
      'KV clear() is not implemented due to Cloudflare KV limitations.'
    );
  });
});
