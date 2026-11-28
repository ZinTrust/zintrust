import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Durable Object isolates never run the main Worker boot, so the JWT session
 * auth store must register its connection lazily (or accept an explicit one).
 */
const state = vi.hoisted(() => {
  const table = {
    where: vi.fn(),
    first: vi.fn(),
    update: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };

  return {
    table,
    registered: false,
    registrationCalls: 0,
    useDatabaseCalls: [] as Array<{ config: unknown; connection: string }>,
    warn: vi.fn(),
    debug: vi.fn(),
  };
});

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback = ''): string => fallback,
    getInt: (_key: string, fallback: number): number => fallback,
    getBool: (_key: string, fallback: boolean): boolean => fallback,
    getFloat: (_key: string, fallback: number): number => fallback,
    APP_KEY: 'app-key',
    REQUEST_TIMEOUT: 5000,
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
  },
}));

vi.mock('@config/workers', () => ({
  createRedisConnection: () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }),
}));

vi.mock('@config/security', () => ({ securityConfig: { jwt: { expiresIn: 60 } } }));
vi.mock('@config/cloudflare', () => ({ Cloudflare: { getKVBinding: () => null } }));
vi.mock('@config/logger', () => ({ Logger: { warn: state.warn, debug: state.debug } }));
vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    create: () => ({
      decode: () => ({
        exp: Math.floor((Date.now() + 60_000) / 1000),
        jti: 'do-jti',
        sub: 'do-user',
      }),
    }),
  },
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    default: 'default',
    connections: { default: { driver: 'sqlite', database: ':memory:' } },
  },
}));

vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: () => {
    state.registrationCalls += 1;
    state.registered = true;
  },
}));

vi.mock('@orm/Database', () => ({
  useDatabase: (config: unknown, connection = 'default') => {
    state.useDatabaseCalls.push({ config, connection });
    if (!state.registered && config === undefined) {
      throw new Error(`Database connection '${connection}' is not registered`);
    }
    return { table: () => state.table };
  },
}));

const load = async (): Promise<typeof import('@/security/JwtSessions')> => {
  vi.resetModules();
  const module = await import('@/security/JwtSessions');
  module.JwtSessions._resetForTests();
  return module;
};

describe('JwtSessions in a Durable Object isolate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.registered = false;
    state.registrationCalls = 0;
    state.useDatabaseCalls.length = 0;
    state.table.where.mockReturnThis();
    state.table.first.mockResolvedValue(null);
    state.table.update.mockResolvedValue(undefined);
    state.table.insert.mockResolvedValue(undefined);
    state.table.delete.mockResolvedValue(undefined);
    delete (globalThis as unknown as { env?: unknown }).env;
  });

  it('lazily registers the missing connection once for all session operations', async () => {
    const { JwtSessions } = await load();

    await JwtSessions.register('token');
    expect(state.registrationCalls).toBe(1);

    state.table.first.mockResolvedValue({ expires_at_ms: String(Date.now() + 60_000) });
    expect(await JwtSessions.isActive('token')).toBe(true);
    expect(await JwtSessions.logout('Bearer token')).toBe('token');
    await JwtSessions.logoutAll('do-user');

    // The guard must not re-register (and clear) connections on every call.
    expect(state.registrationCalls).toBe(1);
    expect(state.useDatabaseCalls.every((call) => call.connection === 'default')).toBe(true);
  });

  it('accepts an explicit D1 binding without globalThis.env or runtime registration', async () => {
    const { JwtSessions } = await load();
    const d1 = { prepare: vi.fn() };

    const sessions = JwtSessions.withConnection({ driver: 'd1', d1 });
    expect(sessions.getDriver()).toBe('database');

    await sessions.register('token');
    expect(state.registrationCalls).toBe(0);
    expect(state.useDatabaseCalls).toContainEqual({ config: { driver: 'd1', d1 }, connection: 'default' });

    state.table.first.mockResolvedValue({ expires_at_ms: String(Date.now() + 60_000) });
    expect(await sessions.isActive('token')).toBe(true);
  });

  it('fails closed when the auth store stays unavailable', async () => {
    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig: () => {
        state.registrationCalls += 1;
      },
    }));
    const { JwtSessions } = await load();

    expect(await JwtSessions.isActive('token')).toBe(false);
    expect(state.warn).toHaveBeenCalledWith(
      'JwtSessions auth store check failed (treating session as inactive)',
      expect.objectContaining({ error: expect.stringContaining('not registered') })
    );

    // Writes still surface errors so callers can detect a broken auth store.
    await expect(JwtSessions.register('token')).rejects.toThrow(/not registered/);
  });
});
