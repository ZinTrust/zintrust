/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Branch-focused coverage for JwtSessions. The store backends are fully mocked:
 * no redis, KV, remote proxy, or database calls leave this file.
 */
const state = vi.hoisted(() => {
  const env: Record<string, string | undefined> = {};
  const redis = {
    get: vi.fn(async (_key: string) => null as string | null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  };
  const kv = {
    get: vi.fn(async (_key: string) => null as string | null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const table = {
    where: vi.fn(),
    first: vi.fn(),
    update: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const db = { table: vi.fn(() => table) };
  const jwt = { decode: vi.fn() };

  return {
    env,
    redis,
    kv,
    table,
    db,
    jwt,
    createRedisConnection: vi.fn(() => redis),
    getKVBinding: vi.fn(() => kv),
    useDatabase: vi.fn(() => db),
    remoteRequest: vi.fn(),
    debug: vi.fn(),
  };
});

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback?: string) => (state.env[key] ?? fallback ?? '') as string,
    getInt: (key: string, fallback: number) => {
      const parsed = Number.parseInt(state.env[key] ?? '', 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    getBool: (key: string, fallback: boolean) => {
      const raw = (state.env[key] ?? '').trim().toLowerCase();
      if (raw === 'true' || raw === '1') return true;
      if (raw === 'false' || raw === '0') return false;
      return fallback;
    },
    getFloat: (key: string, fallback: number) => {
      const parsed = Number.parseFloat(state.env[key] ?? '');
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    APP_KEY: 'app-key',
    REQUEST_TIMEOUT: 5000,
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
  },
}));

vi.mock('@config/workers', () => ({ createRedisConnection: state.createRedisConnection }));
vi.mock('@config/cloudflare', () => ({ Cloudflare: { getKVBinding: state.getKVBinding } }));
vi.mock('@orm/Database', () => ({ useDatabase: state.useDatabase }));
vi.mock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));
vi.mock('@config/logger', () => ({ Logger: { debug: state.debug, error: vi.fn(), warn: vi.fn() } }));
vi.mock('@security/JwtManager', () => ({ JwtManager: { create: () => state.jwt } }));
vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: { request: (...args: unknown[]) => state.remoteRequest(...args) },
}));

const defaults: Record<string, string> = {
  JWT_SESSION_DRIVER: 'memory',
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

const futureExp = () => Math.floor((Date.now() + 60_000) / 1000);

const load = async () => {
  vi.resetModules();
  const { JwtSessions } = await import('@/security/JwtSessions');
  JwtSessions._resetForTests();
  return JwtSessions;
};

describe('branch coverage: JwtSessions branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(state.env)) Reflect.deleteProperty(state.env, key);
    Object.assign(state.env, defaults);

    state.getKVBinding.mockReturnValue(state.kv);
    state.createRedisConnection.mockReturnValue(state.redis);
    state.useDatabase.mockReturnValue(state.db);
    state.table.where.mockReturnThis();
    state.table.first.mockResolvedValue(null);
    state.table.update.mockResolvedValue(undefined);
    state.table.insert.mockResolvedValue(undefined);
    state.table.delete.mockResolvedValue(undefined);
    state.redis.get.mockResolvedValue(null);
    state.redis.set.mockResolvedValue('OK');
    state.redis.del.mockResolvedValue(1);
    state.kv.get.mockResolvedValue(null);
    state.kv.put.mockResolvedValue(undefined);
    state.kv.delete.mockResolvedValue(undefined);

    state.jwt.decode.mockImplementation(() => ({
      exp: futureExp(),
      jti: 'j1',
      sub: 'u1',
    }));

    state.remoteRequest.mockImplementation(async (_settings: unknown, path: string, body: { key?: string }) => {
      if (path === '/zin/kv/get') {
        return { value: String(body.key ?? '').includes(':sub:') ? '[]' : '1' };
      }
      return { ok: true };
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('falls back to the default driver for a non-string driver value', async () => {
    state.env['JWT_SESSION_DRIVER'] = 123 as never;
    const sessions = await load();
    expect(sessions.getDriver()).toBe('database');
  });

  it('accepts the short memory driver alias', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'mem';
    const sessions = await load();
    await sessions.register('t1');
    expect(await sessions.isActive('t1')).toBe(true);
    expect(sessions.getDriver()).toBe('memory');
  });

  it('normalizes non-string authorization arrays and empty bearer tokens', async () => {
    const sessions = await load();
    await expect(sessions.logout([123 as never])).resolves.toBeNull();
    await expect(sessions.logout('Bearer     ')).resolves.toBeNull();
    await expect(sessions.logout(undefined)).resolves.toBeNull();
  });

  it('keeps other ids indexed when one id is reindexed under a new subject', async () => {
    state.jwt.decode.mockImplementation((token: string) => ({
      exp: futureExp(),
      jti: token === 'a2' ? 'a' : token,
      sub: token === 'a2' ? 'u2' : 'u1',
    }));
    const sessions = await load();

    await sessions.register('a');
    await sessions.register('b');
    await sessions.register('a2');

    await sessions.logoutAll('u1');
    expect(await sessions.isActive('b')).toBe(false);
    expect(await sessions.isActive('a')).toBe(true);
  });

  it('reports an unknown memory session as inactive', async () => {
    const sessions = await load();
    expect(await sessions.isActive('never-registered')).toBe(false);
  });

  it('expires an in-memory entry that survives the periodic cleanup pass', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    // Two cleanup passes see the original clock; the final expiry check sees
    // the advanced clock, so the entry reaches the explicit expiry branch.
    nowSpy.mockReturnValueOnce(1_000_000).mockReturnValueOnce(1_000_000).mockReturnValue(2_000_000);
    state.jwt.decode.mockReturnValue({ exp: 1_500, jti: 'timed' });
    const sessions = await load();

    await sessions.register('timed');
    expect(await sessions.isActive('timed')).toBe(false);
    expect(nowSpy).toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('stores null subject columns for sessions without a sub claim', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    state.jwt.decode.mockReturnValue({ exp: futureExp(), jti: 'no-sub' });
    const sessions = await load();

    await sessions.register('no-sub');
    expect(state.table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'no-sub', sub: null, user_id: null })
    );
  });

  it('propagates non-retryable database insert failures', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    state.table.insert.mockRejectedValueOnce(new Error('permission denied'));
    const sessions = await load();

    await expect(sessions.register('t')).rejects.toThrow(/missing required columns/);
  });

  it('runs periodic database cleanup and normalizes Error and non-Error cleanup failures', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    state.table.first.mockResolvedValue({ expires_at_ms: String(Date.now() + 60_000) });
    const sessions = await load();

    state.table.delete.mockRejectedValueOnce(new Error('cleanup failed'));
    for (let i = 0; i < 250; i++) await sessions.isActive(`t${i}`);
    expect(state.debug).toHaveBeenCalledWith(
      'JwtSessions database cleanup failed',
      expect.objectContaining({ error: 'cleanup failed' })
    );

    state.table.delete.mockRejectedValueOnce('plain cleanup failure');
    for (let i = 0; i < 250; i++) await sessions.isActive(`u${i}`);
    expect(state.debug).toHaveBeenCalledWith(
      'JwtSessions database cleanup failed',
      expect.objectContaining({ error: 'plain cleanup failure' })
    );
  });

  it('skips inserts when the database update finds an existing row', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    state.table.first.mockResolvedValue({ jti: 'j1' });
    const sessions = await load();

    await sessions.register('t');
    expect(state.table.insert).not.toHaveBeenCalled();
  });

  it('normalizes Error and non-Error database upsert failures', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    let sessions = await load();

    state.table.update.mockRejectedValueOnce(new Error('bad column'));
    await expect(sessions.register('t')).rejects.toThrow(/missing required columns/);

    sessions = await load();
    state.table.update.mockRejectedValueOnce('plain upsert failure');
    await expect(sessions.register('t')).rejects.toThrow(/missing required columns/);
  });

  it('handles missing, non-numeric, and failing database session rows', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'database';
    let sessions = await load();

    expect(await sessions.isActive('t')).toBe(false);

    sessions = await load();
    state.table.first.mockResolvedValue({ expires_at_ms: 'not-a-number' });
    expect(await sessions.isActive('t')).toBe(true);

    sessions = await load();
    state.table.first.mockRejectedValueOnce(new Error('read failed'));
    await expect(sessions.isActive('t')).resolves.toBe(false);

    sessions = await load();
    state.table.first.mockRejectedValueOnce('plain read failure');
    await expect(sessions.isActive('t')).resolves.toBe(false);
  });

  it('ignores non-array redis subject index values', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'redis';
    state.redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.includes(':sub:') ? '{"a":1}' : null)
    );
    const sessions = await load();

    await expect(sessions.logoutAll('u1')).resolves.toBeUndefined();
  });

  it('skips redis writes for expired sessions and sessions without a subject', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'redis';
    state.jwt.decode.mockReturnValue({ exp: Math.floor((Date.now() - 1000) / 1000), jti: 'old' });
    const expired = await load();
    await expired.register('old');
    expect(state.redis.set).not.toHaveBeenCalled();

    state.jwt.decode.mockReturnValue({ exp: futureExp(), jti: 'no-sub' });
    const noSub = await load();
    await noSub.register('no-sub');
    expect(state.redis.set).toHaveBeenCalledTimes(1);
    expect(state.redis.get).not.toHaveBeenCalled();
  });

  it('skips redis id deletions when the subject index is empty', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'redis';
    const sessions = await load();
    await sessions.register('t');
    await sessions.logoutAll('u1');
    expect(state.redis.del).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the configured KV binding is absent', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv';
    state.getKVBinding.mockReturnValue(null);
    const sessions = await load();
    await expect(sessions.isActive('t')).resolves.toBe(false);
  });

  it('ignores whitespace-only KV subject index values', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv';
    state.kv.get.mockImplementation((key: string) =>
      Promise.resolve(key.includes(':sub:') ? '   ' : '1')
    );
    const sessions = await load();
    await expect(sessions.logoutAll('u1')).resolves.toBeUndefined();
  });

  it('skips KV writes for expired sessions and sessions without a subject', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv';
    state.jwt.decode.mockReturnValue({ exp: Math.floor((Date.now() - 1000) / 1000), jti: 'old' });
    const expired = await load();
    await expired.register('old');
    expect(state.kv.put).not.toHaveBeenCalled();

    state.jwt.decode.mockReturnValue({ exp: futureExp(), jti: 'no-sub' });
    const noSub = await load();
    await noSub.register('no-sub');
    expect(state.kv.put).toHaveBeenCalledTimes(1);
  });

  it('omits the namespace for an empty KV remote namespace setting', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv-remote';
    state.env['JWT_SESSION_KV_REMOTE_NAMESPACE'] = '';
    state.jwt.decode.mockReturnValue({ exp: futureExp(), jti: 'no-sub' });
    const sessions = await load();

    await sessions.register('t');
    const [, , body] = state.remoteRequest.mock.calls[0] as [unknown, string, { namespace?: unknown }];
    expect(body.namespace).toBeUndefined();
  });

  it('fails closed for KV remote requests with missing signing credentials', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv-remote';
    state.env['KV_REMOTE_KEY_ID'] = '';
    const sessions = await load();
    await expect(sessions.isActive('t')).resolves.toBe(false);
  });

  it('ignores non-string and empty values returned by the KV remote proxy', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv-remote';
    state.remoteRequest.mockImplementation(async (_settings: unknown, path: string, body: { key?: string }) => {
      if (path === '/zin/kv/get') {
        return { value: String(body.key ?? '').includes(':sub:') ? {} : { odd: true } };
      }
      return { ok: true };
    });
    const sessions = await load();
    await sessions.register('t');
    await expect(sessions.logoutAll('u1')).resolves.toBeUndefined();
    expect(await sessions.isActive('t')).toBe(true);

    state.remoteRequest.mockImplementation(async (_settings: unknown, path: string) =>
      path === '/zin/kv/get' ? { value: '   ' } : { ok: true }
    );
    expect(await sessions.isActive('t')).toBe(false);

    state.remoteRequest.mockImplementation(async (_settings: unknown, path: string) =>
      path === '/zin/kv/get' ? { value: null } : { ok: true }
    );
    expect(await sessions.isActive('t')).toBe(false);
  });

  it('skips KV remote writes for expired sessions and sessions without a subject', async () => {
    state.env['JWT_SESSION_DRIVER'] = 'kv-remote';
    state.jwt.decode.mockReturnValue({ exp: Math.floor((Date.now() - 1000) / 1000), jti: 'old' });
    const expired = await load();
    await expired.register('old');
    expect(state.remoteRequest).not.toHaveBeenCalled();

    state.jwt.decode.mockReturnValue({ exp: futureExp(), jti: 'no-sub' });
    const noSub = await load();
    await noSub.register('no-sub');
    expect(state.remoteRequest).toHaveBeenCalledTimes(1);
  });

  it('normalizes non-string and empty subjects in logoutAll', async () => {
    const sessions = await load();
    await expect(sessions.logoutAll(123 as never)).resolves.toBeUndefined();
    await expect(sessions.logoutAll('   ')).resolves.toBeUndefined();
  });
});
