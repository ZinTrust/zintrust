import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSignedRequestVerify = (verify: ReturnType<typeof vi.fn>): void => {
  vi.doMock('@security/SignedRequest', () => ({
    SignedRequest: {
      verify,
    },
  }));
};

describe('WorkerSigning patch coverage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('stores nonce values in KV with a minimum one-second ttl and rejects replays', async () => {
    mockSignedRequestVerify(vi.fn());

    const { WorkerSigning } = await import('@proxy/WorkerSigning');
    const get = vi
      .fn<(...args: [string]) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('1');
    const put = vi.fn<(...args: [string, string, { expirationTtl?: number }?]) => Promise<void>>();

    await expect(WorkerSigning.verifyNonceKv({ get, put }, 'kid', 'nonce', 250)).resolves.toBe(
      true
    );
    await expect(WorkerSigning.verifyNonceKv({ get, put }, 'kid', 'nonce', 250)).resolves.toBe(
      false
    );

    expect(get).toHaveBeenNthCalledWith(1, 'nonce:kid:nonce');
    expect(get).toHaveBeenNthCalledWith(2, 'nonce:kid:nonce');
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('nonce:kid:nonce', '1', { expirationTtl: 1 });
  });

  it('reads secrets from the worker env object and maps verification failures', async () => {
    const verify = vi.fn(async () => ({
      ok: false as const,
      code: 'UNKNOWN_KEY' as const,
      message: 'Unknown key id',
    }));

    mockSignedRequestVerify(verify);

    const { WorkerSigning } = await import('@proxy/WorkerSigning');

    await expect(
      WorkerSigning.verifySignedRequest(
        new Request('https://example.com/proxy', {
          method: 'POST',
          headers: {
            'x-zt-key-id': 'kid',
            'x-zt-timestamp': '1',
            'x-zt-nonce': 'nonce',
            'x-zt-body-sha256': 'hash',
            'x-zt-signature': 'sig',
          },
          body: 'payload',
        }),
        {
          KV_REMOTE_SECRET: 'secret',
          ZT_PROXY_SIGNING_WINDOW_MS: '30000',
        },
        new TextEncoder().encode('payload'),
        {
          secretEnvVar: 'KV_REMOTE_SECRET',
          missingSecretStatus: 500,
          missingSecretMessage: 'Missing signing secret (KV_REMOTE_SECRET or APP_KEY)',
          defaultSigningWindowMs: 60_000,
        }
      )
    ).resolves.toEqual({
      ok: false,
      status: 403,
      code: 'UNKNOWN_KEY',
      message: 'Unknown key id',
    });

    expect(verify).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/proxy',
      body: new TextEncoder().encode('payload'),
      headers: expect.any(Headers),
      windowMs: 30_000,
      getSecretForKeyId: expect.any(Function),
      verifyNonce: undefined,
    });
  });

  it('returns a config error when the worker env has no signing secret', async () => {
    mockSignedRequestVerify(vi.fn());

    const { WorkerSigning } = await import('@proxy/WorkerSigning');

    await expect(
      WorkerSigning.verifySignedRequest(
        new Request('https://example.com/proxy', { method: 'POST', body: 'payload' }),
        {},
        new TextEncoder().encode('payload'),
        {
          secretEnvVar: 'D1_REMOTE_SECRET',
          missingSecretStatus: 401,
          missingSecretMessage: 'Missing signing secret (D1_REMOTE_SECRET or APP_KEY)',
          defaultSigningWindowMs: 60_000,
        }
      )
    ).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'CONFIG_ERROR',
      message: 'Missing signing secret (D1_REMOTE_SECRET or APP_KEY)',
    });
  });

  it('uses APP_KEY fallback, default signing window, and nonce verification when ZT_NONCES exists', async () => {
    const verify = vi.fn(async () => ({ ok: true as const }));

    mockSignedRequestVerify(verify);

    const { WorkerSigning } = await import('@proxy/WorkerSigning');
    const kvGet = vi.fn(async () => null);
    const kvPut = vi.fn(async () => undefined);

    await expect(
      WorkerSigning.verifySignedRequest(
        new Request('https://example.com/proxy', { method: 'POST', body: 'payload' }),
        {
          APP_KEY: 'app-secret',
          ZT_PROXY_SIGNING_WINDOW_MS: 'not-a-number',
          ZT_NONCES: { get: kvGet, put: kvPut },
        },
        new TextEncoder().encode('payload'),
        {
          secretEnvVar: 'KV_REMOTE_SECRET',
          missingSecretStatus: 500,
          missingSecretMessage: 'Missing signing secret',
          defaultSigningWindowMs: 45_000,
        }
      )
    ).resolves.toEqual({ ok: true });

    expect(verify).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/proxy',
      body: new TextEncoder().encode('payload'),
      headers: expect.any(Headers),
      windowMs: 45_000,
      getSecretForKeyId: expect.any(Function),
      verifyNonce: expect.any(Function),
    });

    const verifyCall = verify.mock.calls[0]?.[0];
    expect(verifyCall.getSecretForKeyId('kid')).toBe('app-secret');
    await expect(verifyCall.verifyNonce('kid', 'nonce', 250)).resolves.toBe(true);
    expect(kvGet).toHaveBeenCalledWith('nonce:kid:nonce');
    expect(kvPut).toHaveBeenCalledWith('nonce:kid:nonce', '1', { expirationTtl: 1 });
  });

  it.each([
    ['MISSING_HEADER', 401],
    ['INVALID_TIMESTAMP', 401],
    ['EXPIRED', 401],
    ['REPLAYED', 409],
    ['INVALID_SIGNATURE', 403],
  ])('maps %s verification failures to status %s', async (code, status) => {
    const verify = vi.fn(async () => ({
      ok: false as const,
      code,
      message: `failure:${code}`,
    }));

    mockSignedRequestVerify(verify);

    const { WorkerSigning } = await import('@proxy/WorkerSigning');

    await expect(
      WorkerSigning.verifySignedRequest(
        new Request('https://example.com/proxy', { method: 'POST', body: 'payload' }),
        { KV_REMOTE_SECRET: 'secret' },
        new TextEncoder().encode('payload'),
        {
          secretEnvVar: 'KV_REMOTE_SECRET',
          missingSecretStatus: 500,
          missingSecretMessage: 'Missing signing secret',
          defaultSigningWindowMs: 60_000,
        }
      )
    ).resolves.toEqual({
      ok: false,
      status,
      code,
      message: `failure:${code}`,
    });
  });
});
