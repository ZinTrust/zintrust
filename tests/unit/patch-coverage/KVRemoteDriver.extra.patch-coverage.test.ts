/* eslint-disable max-nested-callbacks */
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

describe('patch coverage: KVRemoteDriver extra branches', () => {
  it('covers multi-page namespace listing + namespace-id resolver cache', async () => {
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

      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/storage/kv/namespaces?')) {
          const page = new URL(url).searchParams.get('page') ?? '1';
          if (page === '1') {
            return new Response(
              JSON.stringify({
                success: true,
                result: [],
                result_info: { page: 1, total_pages: 3 },
              }),
              { status: 200 }
            );
          }
          if (page === '2') {
            return new Response(
              JSON.stringify({
                success: true,
                result: [{ id: 'nsid', title: 'my-ns' }],
                result_info: { page: 2, total_pages: 3 },
              }),
              { status: 200 }
            );
          }
          return new Response(
            JSON.stringify({
              success: true,
              result: [],
              result_info: { page: 3, total_pages: 3 },
            }),
            { status: 200 }
          );
        }

        if (url.includes('/storage/kv/namespaces/nsid/values/')) {
          if ((init?.method ?? 'GET') === 'GET') {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
        }

        return new Response('not-handled', { status: 500 });
      });

      vi.stubGlobal('fetch', fetchMock);

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      const driver = KVRemoteDriver.create();

      await expect(driver.get('k')).resolves.toEqual({ ok: true });
      // Second call hits cached namespace id without re-listing.
      await expect(driver.get('k2')).resolves.toEqual({ ok: true });
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers Cloudflare resolver config errors (missing title / not found)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE'] = '';
      process.env['KV_NAMESPACE_ID'] = '';

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('[]', { status: 200 }))
      );

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KVRemoteDriver.create().get('k')).rejects.toThrow(/namespace title is provided/);

      vi.resetModules();
      process.env['KV_NAMESPACE'] = 'missing';
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/storage/kv/namespaces?')) {
            return new Response(
              JSON.stringify({
                success: true,
                result: [{ id: 'id', title: 'other' }],
                result_info: { page: 1, total_pages: 1 },
              }),
              { status: 200 }
            );
          }
          return new Response('not-handled', { status: 500 });
        })
      );
      const { KVRemoteDriver: KV2 } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KV2.create().get('k')).rejects.toThrow(/namespace not found/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers Cloudflare KV API connection errors and empty-body null', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE_ID'] = 'nsid';

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (
            url.includes('/storage/kv/namespaces/nsid/values/') &&
            (init?.method ?? 'GET') === 'GET'
          ) {
            if (url.endsWith('/empty')) return new Response('   ', { status: 200 });
            if (url.endsWith('/boom')) return new Response('bad', { status: 500 });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }

          if (
            url.includes('/storage/kv/namespaces/nsid/values/') &&
            (init?.method ?? 'GET') === 'PUT'
          ) {
            return new Response('bad', { status: 500 });
          }

          if (
            url.includes('/storage/kv/namespaces/nsid/values/') &&
            (init?.method ?? 'GET') === 'DELETE'
          ) {
            return new Response('bad', { status: 500 });
          }

          return new Response('not-handled', { status: 500 });
        })
      );

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      const driver = KVRemoteDriver.create();

      await expect(driver.get('empty')).resolves.toBeNull();
      await expect(driver.get('boom')).rejects.toThrow(/Cloudflare KV GET failed/);
      await expect(driver.set('k', { a: 1 }, 60)).rejects.toThrow(/Cloudflare KV PUT failed/);
      await expect(driver.delete('k')).rejects.toThrow(/Cloudflare KV DELETE failed/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers proxy failure fallback to Cloudflare API (GET/PUT/DELETE) and no-creds rethrow', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      const warn = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { warn } }));

      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request: vi.fn(async () => {
            throw new Error('proxy-down');
          }),
        },
      }));

      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE_ID'] = 'nsid';

      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/storage/kv/namespaces/nsid/values/')) {
          if ((init?.method ?? 'GET') === 'PUT') return new Response('OK', { status: 200 });
          if ((init?.method ?? 'GET') === 'DELETE') return new Response('', { status: 404 });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response('not-handled', { status: 500 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      const driver = KVRemoteDriver.create();
      await expect(driver.get('k')).resolves.toEqual({ ok: true });
      await expect(driver.set('k', { ok: true }, 60)).resolves.toBeUndefined();
      await expect(driver.delete('k')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();

      // No Cloudflare creds -> rethrow
      vi.resetModules();
      process.env['KV_ACCOUNT_ID'] = '';
      process.env['KV_API_TOKEN'] = '';
      process.env['KV_NAMESPACE_ID'] = '';
      vi.stubGlobal('fetch', fetchMock);
      const { KVRemoteDriver: KV2 } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KV2.create().get('k')).rejects.toThrow(/proxy-down/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers Cloudflare getJson invalid JSON -> null', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';
      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE_ID'] = 'nsid';

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/storage/kv/namespaces/nsid/values/')) {
            return new Response('not-json', { status: 200 });
          }
          return new Response('not-handled', { status: 500 });
        })
      );

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KVRemoteDriver.create().get('k')).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers has() path when Cloudflare creds are missing (delegates to this.get)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request: vi.fn(async () => ({ value: null })),
        },
      }));

      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      // Missing Cloudflare creds => has() uses this.get
      process.env['KV_ACCOUNT_ID'] = '';
      process.env['KV_API_TOKEN'] = '';
      process.env['KV_NAMESPACE'] = '';
      process.env['KV_NAMESPACE_ID'] = '';

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      await expect(KVRemoteDriver.create().has('k')).resolves.toBe(false);
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  it('covers has() final branch when Cloudflare creds exist and proxy signing creds exist (delegates to this.get)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ value: null })
        .mockResolvedValueOnce({ value: '1' });

      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request,
        },
      }));

      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      // Cloudflare creds exist (but has() should still delegate to proxy because proxy signing creds exist)
      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE_ID'] = 'nsid';

      const { KVRemoteDriver } = await import('@/cache/drivers/KVRemoteDriver');
      const driver = KVRemoteDriver.create();
      await expect(driver.has('k')).resolves.toBe(false);
      await expect(driver.has('k2')).resolves.toBe(true);
    } finally {
      restoreEnv(envSnapshot);
    }
  });
});
