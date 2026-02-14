import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Proxy signing/config helpers patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('resolveProxySigningConfig uses env fallbacks and normalizes credentials', async () => {
    vi.doMock('@config/env', () => ({
      Env: {
        APP_NAME: 'ZinTrust',
        APP_KEY: 'app-secret',
        get: vi.fn((key: string, fallback?: string) => {
          if (key === 'APP_NAME') return 'ZinTrust';
          if (key === 'APP_KEY') return 'app-secret';
          if (key.endsWith('_KEY_ID')) return '  '; // force APP_NAME fallback
          if (key.endsWith('_SECRET')) return '  '; // force APP_KEY fallback
          return fallback ?? '';
        }),
        getBool: vi.fn((_k: string, d?: boolean) => d ?? true),
        getInt: vi.fn((_k: string, d?: number) => d ?? 60000),
      },
    }));

    vi.doMock('@proxy/SigningService', () => ({
      normalizeSigningCredentials: vi.fn(
        ({ keyId, secret }: { keyId: string; secret: string }) => ({
          keyId: keyId.trim(),
          secret: secret.trim(),
        })
      ),
    }));

    const { resolveProxySigningConfig } = await import('@proxy/ProxySigningConfigResolver');

    const out = resolveProxySigningConfig(undefined, {
      keyIdEnvVar: 'REDIS_PROXY_KEY_ID',
      secretEnvVar: 'REDIS_PROXY_SECRET',
      requireEnvVar: 'REDIS_PROXY_REQUIRE_SIGNING',
      windowEnvVar: 'REDIS_PROXY_SIGNING_WINDOW_MS',
    });

    expect(out.keyId).toBe('ZinTrust');
    expect(out.secret).toBe('app-secret');
    expect(out.requireSigning).toBe(true);
    expect(out.signingWindowMs).toBe(60000);
  });

  it('verifyProxySignatureIfNeeded handles skip and failure paths', async () => {
    const shouldVerify = vi.fn();
    const verify = vi.fn();

    vi.doMock('@proxy/SigningService', () => ({
      SigningService: {
        shouldVerify,
        verify,
      },
    }));

    const { verifyProxySignatureIfNeeded, extractSigningHeaders, normalizeHeaderValue } =
      await import('@proxy/ProxySigningRequest');

    expect(normalizeHeaderValue(['a', 'b'])).toBe('a,b');

    const req = {
      method: 'POST',
      url: '/zin/proxy',
      headers: {
        host: 'localhost:7772',
        'x-zt-key-id': ['k1', 'k2'],
        'x-zt-timestamp': '1700000000000',
        'x-zt-nonce': 'nonce',
        'x-zt-body-sha256': 'hash',
        'x-zt-signature': 'sig',
      },
    } as any;

    const headers = extractSigningHeaders(req);
    expect(headers['x-zt-key-id']).toBe('k1,k2');

    shouldVerify.mockReturnValueOnce(false);
    const skipped = await verifyProxySignatureIfNeeded(req, '{}', {
      keyId: 'kid',
      secret: 'sec',
      require: true,
      windowMs: 60000,
    });
    expect(skipped).toEqual({ ok: true });

    shouldVerify.mockReturnValueOnce(true);
    verify.mockResolvedValueOnce({ ok: false, status: 401, message: 'bad-signature' });
    const failed = await verifyProxySignatureIfNeeded(req, '{}', {
      keyId: 'kid',
      secret: 'sec',
      require: true,
      windowMs: 60000,
    });
    expect(failed).toEqual({ ok: false, error: { status: 401, message: 'bad-signature' } });

    shouldVerify.mockReturnValueOnce(true);
    verify.mockResolvedValueOnce({ ok: true });
    const success = await verifyProxySignatureIfNeeded(req, '{}', {
      keyId: 'kid',
      secret: 'sec',
      require: true,
      windowMs: 60000,
    });
    expect(success).toEqual({ ok: true });
  });

  it('resolveBaseConfig/resolveBaseSigningConfig and verifyRequestSignature cover branches', async () => {
    const debug = vi.fn();
    const warn = vi.fn();

    vi.doMock('@config/env', () => ({
      Env: {
        HOST: '127.0.0.1',
        PORT: 7772,
        MAX_BODY_SIZE: 12345,
        APP_NAME: 'ZinTrust',
        APP_KEY: 'app-secret',
        get: vi.fn((_k: string, d?: string) => d ?? ''),
        getInt: vi.fn((_k: string, d?: number) => d ?? 0),
        getBool: vi.fn((_k: string, d?: boolean) => d ?? true),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug,
        warn,
      },
    }));

    vi.doMock('@proxy/ProxySigningConfigResolver', () => ({
      resolveProxySigningConfig: vi.fn(() => ({
        keyId: 'kid',
        secret: 'secret',
        requireSigning: true,
        signingWindowMs: 60000,
      })),
    }));

    vi.doMock('@proxy/ProxySigningRequest', () => ({
      extractSigningHeaders: vi.fn(() => ({
        'x-zt-key-id': undefined,
      })),
      verifyProxySignatureIfNeeded: vi.fn(async () => ({ ok: false })),
    }));

    const { resolveBaseConfig, resolveBaseSigningConfig, verifyRequestSignature } =
      await import('@proxy/ProxyServerUtils');

    const base = resolveBaseConfig({}, 'POSTGRES', { host: 'h', port: 9999, maxBodyBytes: 88 });
    expect(base).toEqual({ host: '127.0.0.1', port: 7772, maxBodyBytes: 12345 });

    const signing = resolveBaseSigningConfig({}, 'POSTGRES');
    expect(signing).toEqual({
      keyId: 'kid',
      secret: 'secret',
      requireSigning: true,
      signingWindowMs: 60000,
    });

    const verified = await verifyRequestSignature(
      { headers: {}, method: 'POST', url: '/x' } as any,
      '{}',
      { signing: { keyId: 'kid', secret: 'secret', require: true, windowMs: 60000 } },
      'PostgresProxyServer'
    );

    expect(verified).toEqual({ ok: false, error: { status: 401, message: 'Unauthorized' } });
    expect(debug).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    vi.resetModules();

    vi.doMock('@config/env', () => ({
      Env: {
        HOST: '127.0.0.1',
        PORT: 7772,
        MAX_BODY_SIZE: 12345,
        APP_NAME: 'ZinTrust',
        APP_KEY: 'app-secret',
        get: vi.fn((_k: string, d?: string) => d ?? ''),
        getInt: vi.fn((_k: string, d?: number) => d ?? 0),
        getBool: vi.fn((_k: string, d?: boolean) => d ?? true),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
    }));

    vi.doMock('@proxy/ProxySigningConfigResolver', () => ({
      resolveProxySigningConfig: vi.fn(() => ({
        keyId: 'kid',
        secret: 'secret',
        requireSigning: true,
        signingWindowMs: 60000,
      })),
    }));

    vi.doMock('@proxy/ProxySigningRequest', () => ({
      extractSigningHeaders: vi.fn(() => ({ 'x-zt-key-id': 'kid' })),
      verifyProxySignatureIfNeeded: vi.fn(async () => ({ ok: true })),
    }));

    const successUtils = await import('@proxy/ProxyServerUtils');
    const successVerified = await successUtils.verifyRequestSignature(
      { headers: { host: 'localhost' }, method: 'POST', url: '/x' } as any,
      '{}',
      { signing: { keyId: 'kid', secret: 'secret', require: true, windowMs: 60000 } },
      'PostgresProxyServer'
    );
    expect(successVerified).toEqual({ ok: true });
  });

  it('validateSqlPayload enforces sql type and defaults params', async () => {
    const { validateSqlPayload } = await import('@proxy/SqlPayloadValidator');

    const bad = validateSqlPayload({ sql: 123 } as unknown as Record<string, unknown>);
    expect(bad.valid).toBe(false);

    const good = validateSqlPayload({ sql: 'select 1', params: undefined as unknown });
    expect(good).toEqual({ valid: true, sql: 'select 1', params: [] });
  });
});
