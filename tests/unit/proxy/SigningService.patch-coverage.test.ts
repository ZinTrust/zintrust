import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnvWithAppIdentity = (): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      get: vi.fn((key: string, fallback?: string) => {
        if (key === 'APP_NAME') return 'ZinTrust';
        if (key === 'APP_KEY') return 'app-secret';
        return fallback ?? '';
      }),
    },
  }));
};

const mockEnvWithFallbackOnly = (): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      get: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
    },
  }));
};

const mockSignedRequestVerify = (verify: ReturnType<typeof vi.fn>): void => {
  vi.doMock('@security/SignedRequest', () => ({
    SignedRequest: {
      verify,
    },
  }));
};

describe('SigningService patch coverage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('shouldVerify inspects all signing headers before deciding', async () => {
    mockEnvWithAppIdentity();

    const { SigningService } = await import('@proxy/SigningService');

    expect(
      SigningService.shouldVerify(
        { keyId: 'kid', secret: 'secret', require: false, windowMs: 60_000 },
        {
          'x-zt-key-id': '',
          'x-zt-timestamp': '',
          'x-zt-nonce': '',
          'x-zt-body-sha256': '',
          'x-zt-signature': 'sig',
        }
      )
    ).toBe(true);
  });

  it('verifyWithKeyProvider delegates to SignedRequest.verify and maps the result', async () => {
    const verify = vi.fn(async () => ({
      ok: false as const,
      code: 'UNKNOWN_KEY' as const,
      message: 'Unknown key id',
    }));

    mockEnvWithFallbackOnly();
    mockSignedRequestVerify(verify);

    const { SigningService } = await import('@proxy/SigningService');

    const getSecretForKeyId = vi.fn(async (keyId: string) =>
      keyId === 'kid' ? 'secret' : undefined
    );
    const verifyNonce = vi.fn(async () => true);

    await expect(
      SigningService.verifyWithKeyProvider({
        method: 'POST',
        url: 'https://example.com/ingest',
        body: 'payload',
        headers: {
          'x-zt-key-id': 'kid',
          'x-zt-timestamp': '1',
          'x-zt-nonce': 'nonce',
          'x-zt-body-sha256': 'hash',
          'x-zt-signature': 'sig',
        },
        windowMs: 30_000,
        getSecretForKeyId,
        verifyNonce,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      code: 'UNKNOWN_KEY',
      message: 'Unknown key id',
    });

    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/ingest',
      body: 'payload',
      headers: {
        'x-zt-key-id': 'kid',
        'x-zt-timestamp': '1',
        'x-zt-nonce': 'nonce',
        'x-zt-body-sha256': 'hash',
        'x-zt-signature': 'sig',
      },
      windowMs: 30_000,
      getSecretForKeyId,
      verifyNonce,
    });
  });
});
