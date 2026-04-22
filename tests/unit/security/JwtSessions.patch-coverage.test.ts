/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { describe, expect, it, vi } from 'vitest';

const mockEnvModule = (): void => {
  // Keep this mock compatible with modules that may call Env.getBool/getFloat at import time.
  vi.doMock('@config/env', () => ({
    Env: {
      get: (key: string, fallback: string = ''): string => (process.env[key] ?? fallback) as string,
      getInt: (key: string, fallback: number): number => {
        const raw = (process.env[key] ?? '').trim();
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : fallback;
      },
      getBool: (key: string, fallback: boolean): boolean => {
        const raw = (process.env[key] ?? '').trim().toLowerCase();
        if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
        if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
        return fallback;
      },
      getFloat: (key: string, fallback: number): number => {
        const raw = (process.env[key] ?? '').trim();
        const n = Number.parseFloat(raw);
        return Number.isFinite(n) ? n : fallback;
      },
      REQUEST_TIMEOUT: 5000,
      APP_KEY: process.env['APP_KEY'] ?? 'app',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      REDIS_DB: 0,
    },
  }));
};

const mockWorkersModule = (): void => {
  // Prevent importing the full workers config tree in tests that don’t use redis.
  vi.doMock('@config/workers', () => ({
    createRedisConnection: () => ({
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    }),
  }));
};

const makeEnv = (overrides: Record<string, string | undefined>): Record<string, string> => {
  const base: Record<string, string> = {
    JWT_SESSION_DRIVER: 'memory',
    JWT_REVOCATION_DRIVER: 'memory',
    JWT_SESSION_DB_CONNECTION: 'default',
    JWT_SESSION_DB_TABLE: 'zintrust_jwt_revocations',
    JWT_SESSION_REDIS_PREFIX: 'zt:jwt:active:',
    JWT_SESSION_KV_BINDING: 'CACHE',
    JWT_SESSION_KV_PREFIX: 'zt:jwt:active:',
    JWT_SESSION_KV_REMOTE_NAMESPACE: 'ns',
    JWT_SESSION_KV_REMOTE_PREFIX: 'zt:jwt:active:',
    KV_REMOTE_URL: 'https://kv.example.test',
    KV_REMOTE_KEY_ID: 'kid',
    KV_REMOTE_SECRET: 'secret',
  };

  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }

  return base;
};

describe('patch coverage: JwtSessions', () => {
  it('redis driver resolves shared transport with subsystem metadata', async () => {
    vi.resetModules();

    mockEnvModule();

    const getMock = vi.fn(async () => null);
    const setMock = vi.fn(async () => 'OK');
    const delMock = vi.fn(async () => 1);
    const createRedisConnectionMock = vi.fn(() => ({
      get: getMock,
      set: setMock,
      del: delMock,
    }));

    vi.doMock('@config/workers', () => ({
      createRedisConnection: createRedisConnectionMock,
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({
            exp: Math.floor((Date.now() + 60_000) / 1000),
            jti: 'jti-proxy',
            sub: 'u1',
          }),
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    process.env['JWT_SESSION_DRIVER'] = 'redis';
    process.env['REDIS_HOST'] = 'localhost';
    process.env['REDIS_PORT'] = '6379';
    process.env['REDIS_DB'] = '0';

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('t-proxy');

    expect(createRedisConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: 0, port: 6379 }),
      3,
      expect.objectContaining({ subsystem: 'jwt-sessions' })
    );
  });

  it('memory driver: register/isActive/logout/logoutAll with token parsing branches', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();

    // Drive resolveKey() branches via decode() behavior.
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token === 'decode-throws') throw new Error('nope');
            if (token === 'no-jti') return { exp: Math.floor((now + 5_000) / 1000), sub: 'u1' };
            if (token === 'expired')
              return { exp: Math.floor((now - 1_000) / 1000), jti: 'j-exp', sub: 'u1' };
            return { exp: Math.floor((now + 5_000) / 1000), jti: `jti:${token}`, sub: 'u1' };
          },
        }),
      },
    }));

    // Provide securityConfig for defaultTtlMs.
    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    // Ensure driver selection.
    const env = makeEnv({ JWT_SESSION_DRIVER: 'memory' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('t1');
    expect(await JwtSessions.isActive('t1')).toBe(true);

    // getBearerToken() empty/scheme mismatch branches
    expect(await JwtSessions.logout(undefined)).toBeNull();
    expect(await JwtSessions.logout('')).toBeNull();
    expect(await JwtSessions.logout('Token abc')).toBeNull();

    // header array branch
    expect(await JwtSessions.logout(['Bearer t1'])).toBe('t1');
    expect(await JwtSessions.isActive('t1')).toBe(false);

    // jti empty -> id falls back to full token string
    await JwtSessions.register('no-jti');
    expect(await JwtSessions.isActive('no-jti')).toBe(true);
    await JwtSessions.logout('Bearer no-jti');
    expect(await JwtSessions.isActive('no-jti')).toBe(false);

    // decode throws -> still registers with token as id
    await JwtSessions.register('decode-throws');
    expect(await JwtSessions.isActive('decode-throws')).toBe(true);

    // expire path in memory store: expired token should be treated inactive
    await JwtSessions.register('expired');
    expect(await JwtSessions.isActive('expired')).toBe(false);

    // logoutAll removes all for subject via sub index
    await JwtSessions.register('t2');
    await JwtSessions.register('t3');
    expect(await JwtSessions.isActive('t2')).toBe(true);
    expect(await JwtSessions.isActive('t3')).toBe(true);
    await JwtSessions.logoutAll('u1');
    expect(await JwtSessions.isActive('t2')).toBe(false);
    expect(await JwtSessions.isActive('t3')).toBe(false);

    // getDriver()
    expect(JwtSessions.getDriver()).toBe('memory');
  });

  it('memory driver: expired registrations should not bloat logoutAll work', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token.startsWith('expired:')) {
              return {
                exp: Math.floor((now - 60_000) / 1000),
                jti: token,
                sub: 'u-exp',
              };
            }

            return {
              exp: Math.floor((now + 60_000) / 1000),
              jti: token,
              sub: 'u-exp',
            };
          },
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'memory' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    // Register many expired tokens first. Each new register triggers cleanup of prior entries.
    for (let i = 0; i < 200; i++) {
      // eslint-disable-next-line no-await-in-loop
      await JwtSessions.register(`expired:${i}`);
    }

    // Register one active token to force a final cleanup pass.
    await JwtSessions.register('active:1');
    expect(await JwtSessions.isActive('active:1')).toBe(true);

    // Count Map.delete calls during logoutAll. If subIndex retains expired ids, this will be large.
    const originalDelete = Map.prototype.delete;
    let deleteCalls = 0;
    Map.prototype.delete = function (key: unknown): boolean {
      deleteCalls += 1;
      return originalDelete.call(this, key);
    };

    try {
      await JwtSessions.logoutAll('u-exp');
    } finally {
      Map.prototype.delete = originalDelete;
    }

    // Should be small; allow some slack for internal map operations.
    expect(deleteCalls).toBeLessThan(50);
  });

  it('memory driver: re-registering same id with blank sub removes it from sub index', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token === 'with-sub') {
              return { exp: Math.floor((now + 60_000) / 1000), jti: 'same-id', sub: 'u1' };
            }
            if (token === 'no-sub') {
              return { exp: Math.floor((now + 60_000) / 1000), jti: 'same-id', sub: '' };
            }
            return { exp: Math.floor((now + 60_000) / 1000), jti: token, sub: 'u1' };
          },
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'memory' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    // First register indexes id under u1.
    await JwtSessions.register('with-sub');
    expect(await JwtSessions.isActive('with-sub')).toBe(true);

    // Re-register same id but with blank sub => indexDelete branch should run.
    await JwtSessions.register('no-sub');

    // logoutAll(u1) should no longer remove this session because it is no longer indexed.
    await JwtSessions.logoutAll('u1');
    expect(await JwtSessions.isActive('with-sub')).toBe(true);
  });

  it('memory driver: re-registering same id under a different sub reindexes (covers indexDelete on sub change)', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token === 'sub-u1') {
              return { exp: Math.floor((now + 60_000) / 1000), jti: 'same-id2', sub: 'u1' };
            }
            if (token === 'sub-u2') {
              return { exp: Math.floor((now + 60_000) / 1000), jti: 'same-id2', sub: 'u2' };
            }
            return { exp: Math.floor((now + 60_000) / 1000), jti: token, sub: 'u1' };
          },
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'memory' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('sub-u1');
    expect(await JwtSessions.isActive('sub-u1')).toBe(true);

    // Same session id, different subject => should delete old index entry then reindex.
    await JwtSessions.register('sub-u2');

    // logoutAll for u1 should not remove the session anymore.
    await JwtSessions.logoutAll('u1');
    expect(await JwtSessions.isActive('sub-u1')).toBe(true);

    // logoutAll for u2 should remove it.
    await JwtSessions.logoutAll('u2');
    expect(await JwtSessions.isActive('sub-u1')).toBe(false);
  });

  it('database driver: upsert/exists/expiry delete paths', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    const deletes: any[] = [];
    const inserts: any[] = [];

    const makeTable = () => {
      const state: { where: Array<[string, string, unknown]> } = { where: [] };
      const api: any = {
        where: (a: string, b: string, c: unknown) => {
          state.where.push([a, b, c]);
          return api;
        },
        update: vi.fn(async () => undefined),
        first: vi.fn(async () => null),
        insert: vi.fn(async (payload: unknown) => {
          inserts.push(payload);
          return undefined;
        }),
        delete: vi.fn(async () => {
          deletes.push([...state.where]);
          return undefined;
        }),
      };
      return api;
    };

    vi.doMock('@orm/Database', () => ({
      useDatabase: () => ({
        table: () => makeTable(),
      }),
    }));

    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({ exp: Math.floor((now + 10_000) / 1000), jti: 'db-jti', sub: 'db-sub' }),
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'database' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    // Upsert path should attempt update, then first, then insert.
    await JwtSessions.register('any');
    expect(inserts.length).toBe(1);

    // For isActive, emulate row present then expired.
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    const table2: any = {
      where: vi.fn().mockReturnThis(),
      first: vi
        .fn()
        .mockResolvedValueOnce({ expires_at_ms: String(now + 50_000) })
        .mockResolvedValueOnce({ expires_at_ms: String(now - 1) }),
      delete: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      insert: vi.fn(async () => undefined),
    };

    vi.doMock('@orm/Database', () => ({
      useDatabase: () => ({
        table: () => table2,
      }),
    }));

    vi.doMock('@config/logger', () => ({ Logger: { debug: vi.fn() } }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: { createConfigError: (m: string) => new Error(m) },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({ decode: () => ({ jti: 'db2', exp: Math.floor((now + 10_000) / 1000) }) }),
      },
    }));

    vi.doMock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));

    const { JwtSessions: JwtSessions2 } = await import('@/security/JwtSessions');
    JwtSessions2._resetForTests();

    expect(await JwtSessions2.isActive('tok')).toBe(true);
    expect(await JwtSessions2.isActive('tok')).toBe(false);
    expect(table2.delete).toHaveBeenCalled();
  });

  it('database driver: retries inserts with a generated uuid id when uuid auth tables require it', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    const inserts: Array<Record<string, unknown>> = [];
    const table: any = {
      where: vi.fn().mockReturnThis(),
      update: vi.fn(async () => undefined),
      first: vi.fn(async () => null),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        inserts.push(payload);
        if (inserts.length === 1) {
          throw new Error("Field 'id' doesn't have a default value");
        }
        return undefined;
      }),
      delete: vi.fn(async () => undefined),
    };

    vi.doMock('@orm/Database', () => ({
      useDatabase: () => ({
        table: () => table,
      }),
    }));

    vi.doMock('@common/utility', () => ({
      generateUuid: () => 'jwt-session-uuid',
    }));

    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({
            exp: Math.floor((now + 10_000) / 1000),
            jti: 'db-jti-uuid',
            sub: 'db-sub-uuid',
          }),
        }),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          expiresIn: 60,
        },
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'database' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await expect(JwtSessions.register('uuid-token')).resolves.toBeUndefined();
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toMatchObject({
      id: 'jwt-session-uuid',
      jti: 'db-jti-uuid',
      sub: 'db-sub-uuid',
      user_id: 'db-sub-uuid',
      kind: 'active',
    });
  });

  it('redis driver: indexes by sub and supports logoutAll', async () => {
    vi.resetModules();

    mockEnvModule();

    const kv: Record<string, string> = {};
    const client = {
      get: vi.fn(async (key: string) => (key in kv ? kv[key] : null)),
      set: vi.fn(async (key: string, value: string) => {
        kv[key] = value;
        return 'OK';
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) delete kv[k];
        return 1;
      }),
    };

    vi.doMock('@config/workers', () => ({
      createRedisConnection: () => client,
    }));

    vi.doMock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => ({
            exp: Math.floor((now + 10_000) / 1000),
            jti: `r:${token}`,
            sub: 'rsub',
          }),
        }),
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'redis' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('a');
    await JwtSessions.register('b');

    expect(await JwtSessions.isActive('a')).toBe(true);

    // Force index key to exist as JSON.
    // (the module stores index under prefix + ':sub:' + encodedSub)
    // we don't assert exact key format, just that logoutAll results in del calls.
    await JwtSessions.logoutAll('rsub');
    expect(client.del).toHaveBeenCalled();
  });

  it('kv driver: uses Cloudflare KV binding', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    const store = new Map<string, string>();
    const kvBinding = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };

    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getKVBinding: () => kvBinding,
      },
    }));

    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));

    vi.doMock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({ exp: Math.floor((now + 10_000) / 1000), jti: 'k1', sub: 'ksub' }),
        }),
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'kv' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('token');
    expect(await JwtSessions.isActive('token')).toBe(true);
    await JwtSessions.logoutAll('ksub');
    expect(kvBinding.delete).toHaveBeenCalled();
  });

  it('kv-remote driver: uses RemoteSignedJson and throws when URL missing', async () => {
    vi.resetModules();

    mockEnvModule();
    mockWorkersModule();

    const requests: Array<{ path: string; body: any }> = [];

    vi.doMock('@common/RemoteSignedJson', () => ({
      RemoteSignedJson: {
        request: vi.fn(async (_settings: any, path: string, body: any) => {
          requests.push({ path, body });
          if (path === '/zin/kv/get') {
            // For index key, return JSON array of ids; for token key, return a non-empty value.
            if (String(body.key).includes(':sub:'))
              return { value: JSON.stringify(['id1', 'id2']) };
            return { value: '1' };
          }
          if (path === '/zin/kv/put') return { ok: true };
          if (path === '/zin/kv/delete') return { ok: true };
          return { ok: true };
        }),
      },
    }));

    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));

    vi.doMock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));

    const now = Date.now();
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({ exp: Math.floor((now + 10_000) / 1000), jti: 'rid', sub: 'rsub' }),
        }),
      },
    }));

    const env = makeEnv({ JWT_SESSION_DRIVER: 'kv-remote' });
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    const { JwtSessions } = await import('@/security/JwtSessions');
    JwtSessions._resetForTests();

    await JwtSessions.register('token');
    expect(await JwtSessions.isActive('token')).toBe(true);
    await JwtSessions.logoutAll('rsub');
    expect(requests.some((r) => r.path === '/zin/kv/delete')).toBe(true);

    // Missing KV_REMOTE_URL should throw.
    vi.resetModules();
    const env2 = makeEnv({ JWT_SESSION_DRIVER: 'kv-remote', KV_REMOTE_URL: '' });
    for (const [k, v] of Object.entries(env2)) process.env[k] = v;

    const { JwtSessions: JwtSessions2 } = await import('@/security/JwtSessions');
    JwtSessions2._resetForTests();

    await expect(JwtSessions2.isActive('token')).rejects.toThrow(/KV remote proxy URL is missing/i);
  });
});
