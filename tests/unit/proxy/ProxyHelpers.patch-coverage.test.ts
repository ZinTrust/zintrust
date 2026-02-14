import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    APP_NAME: 'ZinTrust',
    APP_KEY: 'app-secret',
    get: vi.fn((key: string, fallback?: string) => {
      if (key === 'APP_NAME') return 'ZinTrust';
      if (key === 'APP_KEY') return 'app-secret';
      if (key === 'PROXY_KEY_ID') return 'env-key';
      if (key === 'PROXY_SECRET') return 'env-secret';
      return fallback ?? '';
    }),
    getBool: vi.fn((_key: string, fallback?: boolean) => fallback ?? true),
    getInt: vi.fn((_key: string, fallback?: number) => fallback ?? 60000),
  },
}));

vi.mock('@proxy/SigningService', () => ({
  SigningService: {
    shouldVerify: vi.fn(),
    verify: vi.fn(),
  },
  normalizeSigningCredentials: vi.fn((input: { keyId: string; secret: string }) => ({
    keyId: input.keyId.trim(),
    secret: input.secret.trim(),
  })),
}));

describe('proxy helpers patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveProxySigningConfig uses env defaults and normalized credentials', async () => {
    const { resolveProxySigningConfig } = await import('@proxy/ProxySigningConfigResolver');

    const out = resolveProxySigningConfig(undefined, {
      keyIdEnvVar: 'PROXY_KEY_ID',
      secretEnvVar: 'PROXY_SECRET',
      requireEnvVar: 'PROXY_REQUIRE',
      windowEnvVar: 'PROXY_WINDOW',
    });

    expect(out).toEqual({
      keyId: 'env-key',
      secret: 'env-secret',
      requireSigning: true,
      signingWindowMs: 60000,
    });
  });

  it('resolveProxySigningConfig respects explicit overrides', async () => {
    const { resolveProxySigningConfig } = await import('@proxy/ProxySigningConfigResolver');

    const out = resolveProxySigningConfig(
      {
        keyId: '  custom-k  ',
        secret: '  custom-s  ',
        requireSigning: false,
        signingWindowMs: 1200,
      },
      {
        keyIdEnvVar: 'PROXY_KEY_ID',
        secretEnvVar: 'PROXY_SECRET',
        requireEnvVar: 'PROXY_REQUIRE',
        windowEnvVar: 'PROXY_WINDOW',
      }
    );

    expect(out).toEqual({
      keyId: 'custom-k',
      secret: 'custom-s',
      requireSigning: false,
      signingWindowMs: 1200,
    });
  });

  it('extractSigningHeaders normalizes multi-value headers', async () => {
    const { extractSigningHeaders } = await import('@proxy/ProxySigningRequest');

    const req = {
      headers: {
        'x-zt-key-id': ['k1', 'k2'],
        'x-zt-signature': 'sig',
      },
    } as any;

    const headers = extractSigningHeaders(req);
    expect(headers['x-zt-key-id']).toBe('k1,k2');
    expect(headers['x-zt-signature']).toBe('sig');
  });

  it('verifyProxySignatureIfNeeded bypasses verification when shouldVerify=false', async () => {
    const { SigningService } = await import('@proxy/SigningService');
    vi.mocked(SigningService.shouldVerify).mockReturnValue(false);

    const { verifyProxySignatureIfNeeded } = await import('@proxy/ProxySigningRequest');

    const result = await verifyProxySignatureIfNeeded(
      {
        method: 'POST',
        url: '/zin/mysql/query',
        headers: { host: 'localhost:3000' },
      } as any,
      '{"sql":"select 1"}',
      { keyId: 'kid', secret: 'sec', require: true, windowMs: 60000 }
    );

    expect(result).toEqual({ ok: true });
    expect(SigningService.verify).not.toHaveBeenCalled();
  });

  it('verifyProxySignatureIfNeeded returns error payload on signature failure', async () => {
    const { SigningService } = await import('@proxy/SigningService');
    vi.mocked(SigningService.shouldVerify).mockReturnValue(true);
    vi.mocked(SigningService.verify).mockResolvedValue({
      ok: false,
      status: 401,
      message: 'bad-signature',
      code: 'INVALID_SIGNATURE',
    } as any);

    const { verifyProxySignatureIfNeeded } = await import('@proxy/ProxySigningRequest');

    const result = await verifyProxySignatureIfNeeded(
      {
        method: 'POST',
        url: '/zin/mysql/query',
        headers: { host: 'localhost:3000', 'x-zt-signature': 'bad' },
      } as any,
      '{"sql":"select 1"}',
      { keyId: 'kid', secret: 'sec', require: true, windowMs: 60000 }
    );

    expect(result).toEqual({ ok: false, error: { status: 401, message: 'bad-signature' } });
  });

  it('validateSqlPayload validates and normalizes params', async () => {
    const { validateSqlPayload } = await import('@proxy/SqlPayloadValidator');

    expect(validateSqlPayload({ sql: 123 as any })).toEqual({
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'sql must be a string' },
    });

    expect(validateSqlPayload({ sql: 'SELECT 1' })).toEqual({
      valid: true,
      sql: 'SELECT 1',
      params: [],
    });

    expect(validateSqlPayload({ sql: 'SELECT ?' as any, params: ['x'] })).toEqual({
      valid: true,
      sql: 'SELECT ?',
      params: ['x'],
    });
  });
});
