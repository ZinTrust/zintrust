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
});
