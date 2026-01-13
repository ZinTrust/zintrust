import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Database Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('uses explicit file path if provided in DB_DATABASE (relative)', async () => {
    process.env['DB_DATABASE'] = './custom.sqlite';
    process.env.NODE_ENV = 'development';

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: './custom.sqlite',
        NODE_ENV: 'development',
        get: (k: string, d: any) => process.env[k] ?? d,
        getBool: () => false,
        getInt: () => 10,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('./custom.sqlite');
  });

  it('uses explicit file path if provided in DB_DATABASE (extension)', async () => {
    process.env['DB_DATABASE'] = 'custom.db'; // ends with .db
    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: 'custom.db',
        NODE_ENV: 'dev',
        get: () => '',
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('custom.db');
  });

  it('resolves default path in .zintrust/dbs using SERVICE_NAME (development)', async () => {
    // DB_DATABASE is ignored if it doesn't look like a path
    // DB_DATABASE is ignored if it doesn't look like a path
    process.env['DB_DATABASE'] = 'ignored';
    process.env['SERVICE_NAME'] = 'my-app';
    process.env.NODE_ENV = 'development';

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: 'ignored',
        NODE_ENV: 'development',
        get: (k: string, d: any) => process.env[k] ?? d,
        getBool: () => false,
        getInt: () => 10,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('.zintrust/dbs/my-app.sqlite');
  });

  // Skipped: "uses DB_DATABASE as-is in production" - already passing

  it('sanitizes unsafe SERVICE_NAME for default path', async () => {
    process.env['SERVICE_NAME'] = 'My App!!! -- Cool';
    process.env.NODE_ENV = 'development';

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: '',
        NODE_ENV: 'development',
        get: () => '',
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('.zintrust/dbs/my-app-cool.sqlite');
  });

  it('falls back to SERVICE_NAME if DB_DATABASE not set', async () => {
    delete process.env['DB_DATABASE'];
    process.env['SERVICE_NAME'] = 'auth-service';

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: '',
        NODE_ENV: 'dev',
        get: (k: string) => (k === 'SERVICE_NAME' ? 'auth-service' : ''),
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('.zintrust/dbs/auth-service.sqlite');
  });

  it('falls back to APP_NAME if SERVICE_NAME not set', async () => {
    delete process.env['DB_DATABASE'];
    delete process.env['SERVICE_NAME'];
    process.env['APP_NAME'] = 'ZinTrust App';

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: '',
        NODE_ENV: 'dev',
        get: (k: string) => (k === 'APP_NAME' ? 'ZinTrust App' : ''),
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('.zintrust/dbs/zintrust-app.sqlite');
  });

  it('defaults to zintrust if nothing set', async () => {
    delete process.env['DB_DATABASE'];
    delete process.env['SERVICE_NAME'];
    delete process.env['APP_NAME'];

    vi.doMock('@/config/env', () => ({
      Env: {
        DB_DATABASE: '',
        NODE_ENV: 'dev',
        get: () => '',
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    // @ts-ignore
    expect(databaseConfig.connections.sqlite.database).toBe('.zintrust/dbs/zintrust.sqlite');
  });

  it('throws if configured DB_CONNECTION does not exist', async () => {
    process.env['DB_CONNECTION'] = 'mongo'; // Not in connections list

    vi.doMock('@/config/env', () => ({
      Env: {
        get: (k: string) => (k === 'DB_CONNECTION' ? 'mongo' : ''),
        getBool: () => false,
        getInt: () => 0,
      },
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    expect(() => databaseConfig.default).toThrow(/Database connection not configured: mongo/);
  });

  it('selects sqlite default if DB_CONNECTION not set', async () => {
    delete process.env['DB_CONNECTION'];

    vi.doMock('@/config/env', () => ({
      Env: { get: (_k: string, d: any) => d, getBool: () => false, getInt: () => 0 }, // Return default
    }));

    const { databaseConfig } = await import('../../../src/config/database');
    expect(databaseConfig.default).toBe('sqlite');
  });

  it('getConnection returns requested connection', async () => {
    vi.doMock('@/config/env', () => ({
      Env: { get: (_k: string, _d: any) => 'sqlite', getBool: () => false, getInt: () => 0 },
    }));
    const { databaseConfig } = await import('../../../src/config/database');
    const conn = databaseConfig.getConnection();
    expect(conn.driver).toBe('sqlite');
  });
});
