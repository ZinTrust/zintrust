import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  envGet: vi.fn((k: string, d: string) => d),
  envGetInt: vi.fn((_k: string, d: number) => d),
  debug: vi.fn(),
  warn: vi.fn(),
  extractSigningHeaders: vi.fn(() => ({ 'x-signature': 'sig' })),
  verifyProxySignatureIfNeeded: vi.fn(async () => ({ ok: true })),
  resolveProxySigningConfig: vi.fn(() => ({
    keyId: 'kid',
    secret: 'sec',
    requireSigning: false,
    signingWindowMs: 1234,
  })),
}));

vi.mock('@config/env', () => ({
  Env: {
    HOST: undefined,
    PORT: undefined,
    MAX_BODY_SIZE: undefined,
    get: (...args: any[]) => mocked.envGet(...args),
    getInt: (...args: any[]) => mocked.envGetInt(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: (...args: any[]) => mocked.debug(...args),
    warn: (...args: any[]) => mocked.warn(...args),
  },
}));

vi.mock('@proxy/ProxySigningConfigResolver', () => ({
  resolveProxySigningConfig: (...args: any[]) => mocked.resolveProxySigningConfig(...args),
}));

vi.mock('@proxy/ProxySigningRequest', () => ({
  extractSigningHeaders: (...args: any[]) => mocked.extractSigningHeaders(...args),
  verifyProxySignatureIfNeeded: (...args: any[]) => mocked.verifyProxySignatureIfNeeded(...args),
}));

import {
  resolveBaseConfig,
  resolveBaseSigningConfig,
  verifyRequestSignature,
} from '@proxy/ProxyServerUtils';

describe('ProxyServerUtils (branches)', () => {
  it('resolveBaseConfig uses overrides, then env, then defaults', () => {
    mocked.envGet.mockReset();
    mocked.envGetInt.mockReset();
    mocked.envGet.mockImplementation((_k: string, d: string) => d);
    mocked.envGetInt.mockImplementation((_k: string, d: number) => d);

    expect(resolveBaseConfig({ host: 'h', port: 1, maxBodyBytes: 2 }, 'X')).toEqual({
      host: 'h',
      port: 1,
      maxBodyBytes: 2,
    });

    mocked.envGet.mockImplementation((_k: string) => 'env-host');
    mocked.envGetInt
      .mockImplementationOnce((_k: string) => 4321)
      .mockImplementationOnce((_k: string) => 999);
    expect(resolveBaseConfig({}, 'X', { host: 'd', port: 3, maxBodyBytes: 4 })).toEqual({
      host: 'env-host',
      port: 4321,
      maxBodyBytes: 999,
    });
  });

  it('resolveBaseConfig falls back to hard-coded defaults when no defaults provided', () => {
    mocked.envGet.mockReset();
    mocked.envGetInt.mockReset();
    mocked.envGet.mockImplementation((_k: string, d: string) => d);
    mocked.envGetInt.mockImplementation((_k: string, d: number) => d);

    expect(resolveBaseConfig({}, 'X')).toEqual({
      host: '127.0.0.1',
      port: 3000,
      maxBodyBytes: 0,
    });
  });

  it('resolveBaseSigningConfig forwards derived env var names', () => {
    const out = resolveBaseSigningConfig({}, 'MYSQL');
    expect(out).toEqual({
      keyId: 'kid',
      secret: 'sec',
      requireSigning: false,
      signingWindowMs: 1234,
    });
    expect(mocked.resolveProxySigningConfig).toHaveBeenCalledWith(
      {},
      {
        keyIdEnvVar: 'MYSQL_PROXY_KEY_ID',
        secretEnvVar: 'MYSQL_PROXY_SECRET',
        requireEnvVar: 'MYSQL_PROXY_REQUIRE_SIGNING',
        windowEnvVar: 'MYSQL_PROXY_SIGNING_WINDOW_MS',
      }
    );
  });

  it('verifyRequestSignature returns ok=false and warns when verification fails', async () => {
    mocked.extractSigningHeaders.mockReturnValueOnce({ 'x-key-id': '', 'x-signature': 'sig' });
    mocked.verifyProxySignatureIfNeeded.mockResolvedValueOnce({ ok: false });

    const req: any = { url: '/x', method: 'POST' };
    const result = await verifyRequestSignature(
      req,
      'body',
      { signing: { keyId: 'kid', secret: 'sec', require: true, windowMs: 1000 } as any },
      'svc'
    );

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ status: 401, message: 'Unauthorized' });
    expect(mocked.warn).toHaveBeenCalled();
  });

  it('verifyRequestSignature surfaces explicit verification errors and handles empty signing headers', async () => {
    mocked.extractSigningHeaders.mockReturnValueOnce({ 'x-key-id': ' ', 'x-signature': ' ' });
    mocked.verifyProxySignatureIfNeeded.mockResolvedValueOnce({
      ok: false,
      error: { status: 403, message: 'Forbidden' },
    });

    const req: any = { url: undefined, method: undefined };
    const result = await verifyRequestSignature(
      req,
      'body',
      { signing: { keyId: 'kid', secret: 'sec', require: false, windowMs: 1000 } as any },
      'svc'
    );

    expect(result).toEqual({ ok: false, error: { status: 403, message: 'Forbidden' } });
  });

  it('verifyRequestSignature returns ok=true when verification passes', async () => {
    mocked.verifyProxySignatureIfNeeded.mockResolvedValueOnce({ ok: true });
    const req: any = { url: '/x', method: 'GET' };
    await expect(
      verifyRequestSignature(
        req,
        '',
        { signing: { keyId: 'kid', secret: 'sec', require: false, windowMs: 1000 } as any },
        'svc'
      )
    ).resolves.toEqual({ ok: true });
  });
});
