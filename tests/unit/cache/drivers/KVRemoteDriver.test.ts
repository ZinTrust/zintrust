import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('KVRemoteDriver', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env['KV_REMOTE_URL'] = 'https://proxy.example/base';
    process.env['KV_REMOTE_KEY_ID'] = 'k1';
    process.env['KV_REMOTE_SECRET'] = 'secret';
    process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env['KV_REMOTE_URL'];
    delete process.env['KV_REMOTE_KEY_ID'];
    delete process.env['KV_REMOTE_SECRET'];
    delete process.env['KV_REMOTE_NAMESPACE'];
  });

  it('calls /zin/kv/put with namespace', async () => {
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { ok: true })) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await driver.set('a', { ok: true }, 60);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(String(url)).toContain('/base/zin/kv/put');
    const payload = JSON.parse(String(init.body)) as any;
    expect(payload.namespace).toBe('CACHE');
    expect(payload.key).toBe('a');
    expect(payload.ttlSeconds).toBe(60);
  });
});
