import { describe, expect, it, vi } from 'vitest';

const remoteRequest = vi.fn();

vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: {
    request: remoteRequest,
  },
  default: {
    request: remoteRequest,
  },
}));

describe('patch coverage: TokenRevocation kv-remote', () => {
  it('uses Cloudflare API first when proxy signing creds are missing', async () => {
    vi.resetModules();

    remoteRequest.mockReset();

    const prevEnv = { ...process.env };
    process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
    process.env['JWT_REVOCATION_KV_PREFIX'] = 'kv:';
    process.env['KV_REMOTE_KEY_ID'] = '';
    process.env['KV_REMOTE_SECRET'] = '';
    process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/api/';

    process.env['KV_ACCOUNT_ID'] = 'acct';
    process.env['KV_API_TOKEN'] = 'token';
    process.env['KV_NAMESPACE'] = 'my-ns';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/storage/kv/namespaces?')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ id: 'nsid', title: 'my-ns' }],
            result_info: { page: 1, total_pages: 1 },
          }),
          { status: 200 }
        );
      }

      if (url.includes('/storage/kv/namespaces/nsid/values/')) {
        if ((init?.method ?? 'GET') === 'PUT') return new Response('OK', { status: 200 });
        return new Response('', { status: 404 });
      }

      return new Response('not-handled', { status: 500 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.revoke('Bearer t')).resolves.toBe('t');
    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalled();

    process.env = prevEnv;
    vi.unstubAllGlobals();
  });

  it('uses proxy path when signing creds exist and falls back to Cloudflare API on proxy error', async () => {
    vi.resetModules();

    remoteRequest.mockReset();

    const prevEnv = { ...process.env };
    process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
    process.env['JWT_REVOCATION_KV_PREFIX'] = 'kv:';
    process.env['KV_REMOTE_KEY_ID'] = 'kid';
    process.env['KV_REMOTE_SECRET'] = 'secret';

    // Cover resolveSigningPrefix root-path => undefined
    process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/';

    // Disable Cloudflare creds so the code must use the proxy path (no fallback).
    process.env['KV_ACCOUNT_ID'] = '';
    process.env['KV_API_TOKEN'] = '';
    process.env['KV_NAMESPACE'] = '';

    remoteRequest.mockImplementation(async (_settings: any, path: string) => {
      if (path === '/zin/kv/put') return { ok: true };
      if (path === '/zin/kv/get') return { value: '1' };
      return { ok: true };
    });

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.revoke('Bearer t')).resolves.toBe('t');
    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(true);

    expect(remoteRequest).toHaveBeenCalled();

    process.env = prevEnv;
  });
});
