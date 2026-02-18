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

describe('patch coverage: TokenRevocation kv-remote Cloudflare branches', () => {
  it('covers multi-page namespace resolution + Cloudflare API check failed warnMeta + value.trim branch', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };

    const warn = vi.fn();
    const debug = vi.fn();
    const error = vi.fn();
    const info = vi.fn();

    try {
      vi.doMock('@config/logger', () => ({ Logger: { warn, debug, error, info } }));

      // Force proxy-first, but make proxy fail.
      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request: vi.fn(async () => {
            throw new Error('proxy-down');
          }),
        },
      }));

      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

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

        if (
          url.includes('/storage/kv/namespaces/nsid/values/') &&
          (init?.method ?? 'GET') === 'GET'
        ) {
          // First check: non-ok -> should warn and return false
          const decoded = decodeURIComponent(url);
          if (decoded.includes('zt:jwt:revoked:bad')) return new Response('bad', { status: 500 });
          // Second check: ok -> value.trim() !== '' => true
          return new Response('1', { status: 200 });
        }

        return new Response('not-handled', { status: 500 });
      });

      vi.stubGlobal('fetch', fetchMock);

      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();

      await expect(TokenRevocation.isRevoked('bad')).resolves.toBe(false);
      await expect(TokenRevocation.isRevoked('good')).resolves.toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers Cloudflare API revoke failed warnMeta (proxy PUT fails -> fallback PUT not ok)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };

    const warn = vi.fn();
    const debug = vi.fn();
    const error = vi.fn();
    const info = vi.fn();

    try {
      vi.doMock('@config/logger', () => ({ Logger: { warn, debug, error, info } }));

      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request: vi.fn(async () => {
            throw new Error('proxy-down');
          }),
        },
      }));

      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE_ID'] = 'nsid';

      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (
          url.includes('/storage/kv/namespaces/nsid/values/') &&
          (init?.method ?? 'GET') === 'PUT'
        ) {
          return new Response('bad', { status: 500 });
        }
        return new Response('not-handled', { status: 500 });
      });

      vi.stubGlobal('fetch', fetchMock);

      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();

      await expect(TokenRevocation.revoke('Bearer not-a-jwt')).resolves.toBe('not-a-jwt');
      expect(fetchMock).toHaveBeenCalled();
      expect(
        warn.mock.calls.length + debug.mock.calls.length + info.mock.calls.length
      ).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers missing namespace title config error when namespace id missing', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };

    try {
      const warn = vi.fn();
      const debug = vi.fn();
      const error = vi.fn();
      const info = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { warn, debug, error, info } }));

      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE'] = '';
      process.env['KV_NAMESPACE_ID'] = '';

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('not-handled', { status: 500 }))
      );

      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();

      await expect(TokenRevocation.isRevoked('t')).rejects.toThrow(/namespace title is provided/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers namespace not found (kvRemoteFindNamespaceIdByTitle returns null)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };

    try {
      const warn = vi.fn();
      const debug = vi.fn();
      const error = vi.fn();
      const info = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { warn, debug, error, info } }));

      // Force Cloudflare API path
      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = '';
      process.env['KV_REMOTE_SECRET'] = '';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      process.env['KV_ACCOUNT_ID'] = 'acct';
      process.env['KV_API_TOKEN'] = 'token';
      process.env['KV_NAMESPACE'] = 'missing-ns';
      process.env['KV_NAMESPACE_ID'] = '';

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/storage/kv/namespaces?')) {
            const page = new URL(url).searchParams.get('page') ?? '1';
            return new Response(
              JSON.stringify({
                success: true,
                result: [{ id: `id-${page}`, title: 'other' }],
                result_info: { page: Number(page), total_pages: 2 },
              }),
              { status: 200 }
            );
          }
          return new Response('not-handled', { status: 500 });
        })
      );

      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();

      await expect(TokenRevocation.isRevoked('t')).rejects.toThrow(/namespace not found/);
    } finally {
      vi.unstubAllGlobals();
      restoreEnv(envSnapshot);
    }
  });

  it('covers proxy error rethrow when Cloudflare API creds are missing (isRevoked + revoke)', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };

    try {
      vi.doMock('@config/logger', () => ({
        Logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
      }));

      vi.doMock('@common/RemoteSignedJson', () => ({
        RemoteSignedJson: {
          request: vi.fn(async () => {
            throw new Error('proxy-down');
          }),
        },
      }));

      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/base';
      process.env['KV_REMOTE_KEY_ID'] = 'kid';
      process.env['KV_REMOTE_SECRET'] = 'secret';
      process.env['KV_REMOTE_NAMESPACE'] = 'CACHE';

      // No Cloudflare API creds
      process.env['KV_ACCOUNT_ID'] = '';
      process.env['KV_API_TOKEN'] = '';
      process.env['KV_NAMESPACE'] = '';
      process.env['KV_NAMESPACE_ID'] = '';

      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();

      await expect(TokenRevocation.isRevoked('t')).rejects.toThrow(/proxy-down/);
      await expect(TokenRevocation.revoke('Bearer t')).rejects.toThrow(/proxy-down/);
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  it('covers getDriver() delegating to resolveStore()', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    try {
      process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
      const { TokenRevocation } = await import('@/security/TokenRevocation');
      TokenRevocation._resetForTests();
      expect(TokenRevocation.getDriver()).toBe('kv-remote');
    } finally {
      restoreEnv(envSnapshot);
    }
  });
});
