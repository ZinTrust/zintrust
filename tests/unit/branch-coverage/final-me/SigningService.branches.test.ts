/* eslint-disable no-nested-ternary -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  envGet: vi.fn(),
}));

vi.mock('@security/SignedRequest', () => ({ SignedRequest: { verify: mocks.verify } }));
vi.mock('@config/env', () => ({ Env: { get: mocks.envGet } }));

import {
  normalizeSigningConfig,
  normalizeSigningCredentials,
  SigningService,
} from '@proxy/SigningService';

const signing = (overrides: Record<string, unknown> = {}) => ({
  require: false,
  keyId: 'kid',
  secret: 'sec',
  windowMs: 60000,
  ...overrides,
});

const params = (overrides: Record<string, unknown> = {}) => ({
  method: 'GET',
  url: 'http://localhost/x',
  body: '',
  headers: {},
  ...overrides,
});

describe('SigningService branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.envGet.mockImplementation((_k: string, fallback: string) => fallback);
    mocks.verify.mockResolvedValue({ ok: true });
  });

  it('normalizes key ids and secrets with env fallbacks', () => {
    expect(normalizeSigningCredentials({ keyId: ' Key ID ', secret: ' sec ' })).toEqual({
      keyId: 'key id',
      secret: 'sec',
    });
    mocks.envGet.mockImplementation((key: string) =>
      key === 'APP_NAME' ? ' My App ' : key === 'APP_KEY' ? 'env-secret' : ''
    );
    expect(normalizeSigningConfig(signing({ keyId: '  ', secret: ' ' }))).toMatchObject({
      keyId: '_my_app_',
      secret: 'env-secret',
    });
    mocks.envGet.mockReturnValue('  ');
    expect(normalizeSigningCredentials({ keyId: '', secret: '' })).toMatchObject({
      keyId: 'zintrust',
      secret: '  ',
    });
  });

  it('shouldVerify handles Headers, records, require and partial signing headers', () => {
    expect(SigningService.shouldVerify(signing({ require: true }), params().headers)).toBe(true);
    expect(SigningService.shouldVerify(signing(), params().headers)).toBe(false);
    const headers = new Headers({ 'x-zt-key-id': 'kid' });
    expect(SigningService.shouldVerify(signing(), headers)).toBe(true);
    expect(
      SigningService.shouldVerify(signing(), { 'x-zt-timestamp': undefined, 'x-zt-nonce': 'n' })
    ).toBe(true);
    expect(SigningService.shouldVerify(signing(), { 'x-zt-body-sha256': 'h' })).toBe(true);
    expect(SigningService.shouldVerify(signing(), { 'x-zt-signature': 'sig' })).toBe(true);
    expect(SigningService.shouldVerify(signing({ secret: ' ' }), headers)).toBe(false);
  });

  it.each([
    [{ ok: true }, { ok: true }],
    [{ ok: false, code: 'MISSING_HEADER', message: 'm' }, { status: 401 }],
    [{ ok: false, code: 'INVALID_TIMESTAMP', message: 'm' }, { status: 401 }],
    [{ ok: false, code: 'EXPIRED', message: 'm' }, { status: 401 }],
    [{ ok: false, code: 'UNKNOWN_KEY', message: 'm' }, { status: 403 }],
    [{ ok: false, code: 'REPLAYED', message: 'm' }, { status: 409 }],
    [{ ok: false, code: 'OTHER', message: 'm' }, { status: 403 }],
  ])('maps verify result %j', async (result, expected) => {
    mocks.verify.mockResolvedValueOnce(result);
    await expect(SigningService.verify(params({ signing: signing() }))).resolves.toMatchObject(
      expected
    );
  });

  it('verify resolves secrets via the normalized key id provider', async () => {
    await SigningService.verify(
      params({ signing: signing({ keyId: 'MiXeD', secret: 'sec' }) })
    );
    const provider = mocks.verify.mock.calls[0]?.[0].getSecretForKeyId;
    await expect(provider(' mixed ')).resolves.toBe('sec');
    await expect(provider('other')).resolves.toBeUndefined();
  });

  it('verifyWithKeyProvider forwards provider and nonce checker', async () => {
    const getSecretForKeyId = vi.fn().mockResolvedValue('sec');
    const verifyNonce = vi.fn().mockResolvedValue(true);
    await SigningService.verifyWithKeyProvider(
      params({ windowMs: 1234, getSecretForKeyId, verifyNonce })
    );
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ windowMs: 1234, getSecretForKeyId, verifyNonce })
    );
  });
});
