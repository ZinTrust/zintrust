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

describe('patch coverage: TokenRevocation kv-remote Cloudflare namespaces errors', () => {
  const prevEnv = { ...process.env };

  const setEnvForCloudflareFirst = (): void => {
    process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
    process.env['JWT_REVOCATION_KV_PREFIX'] = 'kv:';

    // Missing proxy signing creds => Cloudflare API first when CF creds exist
    process.env['KV_REMOTE_KEY_ID'] = '';
    process.env['KV_REMOTE_SECRET'] = '';
    process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/';

    process.env['KV_ACCOUNT_ID'] = 'acct';
    process.env['KV_API_TOKEN'] = 'token';
    process.env['KV_NAMESPACE'] = 'my-ns';
  };

  it('throws connection error when Cloudflare namespaces list is non-ok', async () => {
    vi.resetModules();
    restoreEnv(prevEnv);
    setEnvForCloudflareFirst();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/storage/kv/namespaces?')) {
          return new Response('nope', { status: 500 });
        }
        return new Response('not-handled', { status: 500 });
      })
    );

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.revoke('Bearer t')).rejects.toThrow(/namespaces list failed/);
    vi.unstubAllGlobals();
  });

  it('throws connection error when Cloudflare namespaces list returns invalid JSON', async () => {
    vi.resetModules();
    restoreEnv(prevEnv);
    setEnvForCloudflareFirst();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/storage/kv/namespaces?')) {
          return new Response('not-json', { status: 200 });
        }
        return new Response('not-handled', { status: 500 });
      })
    );

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.isRevoked('t')).rejects.toThrow(/invalid JSON/);
    vi.unstubAllGlobals();
  });

  it('covers non-finite total_pages normalization branch', async () => {
    vi.resetModules();
    restoreEnv(prevEnv);
    setEnvForCloudflareFirst();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/storage/kv/namespaces?')) {
          return new Response(
            JSON.stringify({
              success: true,
              result: [],
              result_info: { page: 1, total_pages: 'abc' },
            }),
            { status: 200 }
          );
        }
        return new Response('not-handled', { status: 500 });
      })
    );

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.isRevoked('t')).rejects.toThrow(/namespace not found/);
    vi.unstubAllGlobals();
  });
});
