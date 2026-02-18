import { describe, expect, it, vi } from 'vitest';

const cfState = vi.hoisted(() => ({
  kvBinding: null as null | {
    put: (key: string, value: string, opts?: unknown) => Promise<void>;
    get: (key: string) => Promise<string | null>;
  },
}));

vi.mock('@config/cloudflare', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('@config/cloudflare');
  return {
    ...original,
    Cloudflare: {
      ...original.Cloudflare,
      getWorkersEnv: () => null,
      getKVBinding: () => cfState.kvBinding,
    },
  };
});

describe('patch coverage: TokenRevocation redis + kv stores', () => {
  it('covers redis store set/get + ttlMs==0 early return', async () => {
    vi.resetModules();

    const setMock = vi.fn(async () => 'OK');
    const getMock = vi.fn(async () => '1');

    vi.doMock('@config/workers', () => ({
      createRedisConnection: () => ({
        set: setMock,
        get: getMock,
      }),
    }));

    const prevDriver = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'redis';
    process.env['JWT_REVOCATION_REDIS_PREFIX'] = 'zt:test:';
    process.env['REDIS_HOST'] = 'localhost';
    process.env['REDIS_PORT'] = '6379';
    process.env['REDIS_PASSWORD'] = '';
    process.env['REDIS_DB'] = '0';

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token === 'expired') {
              return { exp: Math.floor(Date.now() / 1000) - 10, jti: 'jti-exp' };
            }
            return { exp: Math.floor(Date.now() / 1000) + 60, jti: 'jti-ok' };
          },
        }),
      },
    }));

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    // active token -> should call redis set
    await expect(TokenRevocation.revoke('Bearer ok')).resolves.toBe('ok');
    expect(setMock).toHaveBeenCalled();

    // isRevoked uses redis get
    await expect(TokenRevocation.isRevoked('ok')).resolves.toBe(true);
    expect(getMock).toHaveBeenCalled();

    // expired token => ttlMs==0 -> early return, no set
    setMock.mockClear();
    await expect(TokenRevocation.revoke('Bearer expired')).resolves.toBe('expired');
    expect(setMock).not.toHaveBeenCalled();

    if (prevDriver === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
    else process.env['JWT_REVOCATION_DRIVER'] = prevDriver;
  });

  it('covers kv store getKvOrThrow null and happy put/get branches', async () => {
    vi.resetModules();

    const putMock = vi.fn(async () => undefined);
    const getMock = vi.fn(async () => '1');

    cfState.kvBinding = { put: putMock, get: getMock };

    const prevDriver = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'kv';
    process.env['JWT_REVOCATION_KV_BINDING'] = 'CACHE';
    process.env['JWT_REVOCATION_KV_PREFIX'] = 'zt:test:';

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.revoke('Bearer t')).resolves.toBe('t');
    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(true);
    expect(putMock).toHaveBeenCalled();
    expect(getMock).toHaveBeenCalled();

    // missing binding -> throws config error
    TokenRevocation._resetForTests();
    cfState.kvBinding = null;
    await expect(TokenRevocation.revoke('Bearer t2')).rejects.toThrow(/KV binding/);

    if (prevDriver === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
    else process.env['JWT_REVOCATION_DRIVER'] = prevDriver;

    cfState.kvBinding = null;
  });
});
