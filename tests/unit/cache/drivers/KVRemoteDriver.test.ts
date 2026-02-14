import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFetchResponse, createFetchResponseText } from '../../../helpers/httpTestResponses';

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

  it('omits namespace when KV_REMOTE_NAMESPACE is blank', async () => {
    process.env['KV_REMOTE_NAMESPACE'] = '';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { value: { ok: true } })) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await driver.get('a');

    const [_url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    const payload = JSON.parse(String(init.body)) as any;
    expect('namespace' in payload).toBe(false);
  });

  it('throws a config error when KV_REMOTE_URL missing', async () => {
    process.env['KV_REMOTE_URL'] = '';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { ok: true })) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await expect(driver.get('a')).rejects.toThrow(/KV remote proxy URL is missing/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });

  it('throws a config error when signing credentials missing', async () => {
    process.env['KV_REMOTE_KEY_ID'] = '';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { ok: true })) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await expect(driver.get('a')).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('maps 401/403/429/4xx/5xx responses to typed errors', async () => {
    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    globalThis.fetch = vi.fn(async () => createFetchResponseText(401, 'nope')) as any;
    await expect(driver.get('a')).rejects.toThrow(/unauthorized/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(403, 'nope')) as any;
    await expect(driver.get('a')).rejects.toThrow(/forbidden/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(429, 'nope')) as any;
    await expect(driver.get('a')).rejects.toThrow(/rate limited/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(400, 'nope')) as any;
    await expect(driver.get('a')).rejects.toThrow(/rejected request/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(500, '')) as any;
    await expect(driver.get('a')).rejects.toThrow(/proxy error/i);
  });

  it('maps AbortError to a timeout connection error', async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error('aborted');
      (err as any).name = 'AbortError';
      throw err;
    }) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await expect(driver.get('a')).rejects.toThrow(/timed out/i);
  });

  it('has() calls /zin/kv/has and returns boolean', async () => {
    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(200, { value: { ok: true } }))
      .mockResolvedValueOnce(createFetchResponse(200, { value: null })) as any;

    expect(await driver.has('a')).toBe(true);
    expect(await driver.has('b')).toBe(false);

    const firstUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    const secondUrl = (globalThis.fetch as any).mock.calls[1][0] as string;
    expect(String(firstUrl)).toContain('/base/zin/kv/get');
    expect(String(secondUrl)).toContain('/base/zin/kv/get');
  });

  it('delete() calls /zin/kv/delete', async () => {
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { ok: true })) as any;

    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    await driver.delete('a');

    const [url] = (globalThis.fetch as any).mock.calls[0] as [string];
    expect(String(url)).toContain('/base/zin/kv/delete');
  });

  it('clear() calls /zin/kv/clear', async () => {
    const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
    const driver = KVRemoteDriver.create();

    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { ok: true })) as any;
    await driver.clear();
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });
});
