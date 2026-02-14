import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    createHeaders: vi.fn(async () => ({
      'x-zt-key-id': 'kid',
      'x-zt-timestamp': 'ts',
      'x-zt-nonce': 'nonce',
      'x-zt-body-sha256': 'sha',
      'x-zt-signature': 'sig',
    })),
  },
}));

describe('proxy signing helpers patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveSigningPrefix handles invalid/root/path values', async () => {
    const { resolveSigningPrefix } = await import('@orm/adapters/ProxySigningPath');

    expect(resolveSigningPrefix('not-a-url')).toBeUndefined();
    expect(resolveSigningPrefix('http://example.com/')).toBeUndefined();
    expect(resolveSigningPrefix('http://example.com/api/')).toBe('/api');
  });

  it('buildSigningUrl strips configured path prefix when request path is nested', async () => {
    const { buildSigningUrl } = await import('@orm/adapters/ProxySigningPath');

    const out = buildSigningUrl(
      new URL('http://localhost/api/v1/zin/mysql/query'),
      'http://localhost/api/v1'
    );
    expect(out.pathname).toBe('/zin/mysql/query');

    const untouched = buildSigningUrl(
      new URL('http://localhost/zin/mysql/query'),
      'http://localhost/api'
    );
    expect(untouched.pathname).toBe('/zin/mysql/query');
  });

  it('createSignedProxyRequest throws config error when credentials are blank', async () => {
    const { createSignedProxyRequest } = await import('@orm/adapters/ProxySignedRequest');

    await expect(
      createSignedProxyRequest({
        url: 'http://localhost:8792',
        body: '{"ok":1}',
        keyId: ' ',
        secret: ' ',
        missingCredentialsMessage: 'missing-creds',
      })
    ).rejects.toMatchObject({ message: 'missing-creds', code: 'CONFIG_ERROR' });
  });

  it('createSignedProxyRequest returns signed headers and body', async () => {
    const { SignedRequest } = await import('@security/SignedRequest');
    const { createSignedProxyRequest } = await import('@orm/adapters/ProxySignedRequest');

    const out = await createSignedProxyRequest({
      url: 'http://localhost:8792',
      body: '{"ok":1}',
      keyId: 'kid',
      secret: 'secret',
      missingCredentialsMessage: 'missing-creds',
    });

    expect(SignedRequest.createHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', keyId: 'kid', secret: 'secret' })
    );
    expect(out.headers['content-type']).toBe('application/json');
    expect(out.headers['x-zt-signature']).toBe('sig');
    expect(out.body).toBe('{"ok":1}');
  });
});
