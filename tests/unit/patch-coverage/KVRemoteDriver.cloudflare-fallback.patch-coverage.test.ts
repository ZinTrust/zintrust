import { describe, expect, it, vi } from 'vitest';

const restoreEnv = (snapshot: NodeJS.ProcessEnv): void => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) Reflect.deleteProperty(process.env, key);
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
};

describe('patch coverage: KVRemoteDriver Cloudflare API fallback', () => {
  it('uses Cloudflare API when proxy signing creds missing (get/set/delete/has)', async () => {
    vi.resetModules();

    const envSnapshot = { ...process.env };
    try {
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE'] = 'my-ns';
      process.env['KV_NAMESPACE_ID'] = '';

      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/storage/kv/namespaces?')) {
          // include non-finite total_pages to cover normalization
          return new Response(
            JSON.stringify({
              success: true,
              result: [{ id: 'nsid', title: 'my-ns' }],
              result_info: { page: 1, total_pages: 'abc' },
            }),
            { status: 200 }
          );
        }

        if (url.includes('/storage/kv/namespaces/nsid/values/')) {
          if ((init?.method ?? 'GET') === 'PUT') {
            return new Response('OK', { status: 200 });
          }
          if ((init?.method ?? 'GET') === 'DELETE') {
            return new Response('', { status: 404 });
          }
          // GET
          if (url.endsWith('/k-missing')) return new Response('', { status: 404 });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        return new Response('not-handled', { status: 500 });
      });

      vi.stubGlobal('fetch', fetchMock);

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      const driver = KVRemoteDriver.create();

      await expect(driver.get('k')).resolves.toEqual({ ok: true });
      await expect(driver.get('k-missing')).resolves.toBeNull();
      await expect(driver.set('k', { ok: true }, 60)).resolves.toBeUndefined();
      await expect(driver.has('k')).resolves.toBe(true);
      await expect(driver.delete('k')).resolves.toBeUndefined();

      // should include Cloudflare Authorization header at least once
      const calls = fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
      expect(calls.some((c) => String(c[0]).includes('api.cloudflare.com'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('throws connection errors for Cloudflare namespaces list non-ok and invalid JSON', async () => {
    vi.resetModules();

    const envSnapshot = { ...process.env };
    try {
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';
      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE'] = 'my-ns';
      process.env['KV_NAMESPACE_ID'] = '';

      // non-ok
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/storage/kv/namespaces?')) return new Response('nope', { status: 500 });
          return new Response('not-handled', { status: 500 });
        })
      );

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KVRemoteDriver.create().get('k')).rejects.toThrow(/namespaces list failed/);

      // invalid JSON
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/storage/kv/namespaces?'))
            return new Response('not-json', { status: 200 });
          return new Response('not-handled', { status: 500 });
        })
      );

      vi.resetModules();
      const { KVRemoteDriver: KV2 } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KV2.create().get('k')).rejects.toThrow(/invalid JSON/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });
});
