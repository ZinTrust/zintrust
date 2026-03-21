import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('cli/d1/LocalD1Resolver (coverage)', () => {
  it('throws a descriptive error when the target cannot be resolved', async () => {
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));
    vi.doMock('@cli/d1/WranglerConfig', () => ({
      WranglerConfig: {
        getD1Database: vi.fn(() => undefined),
        getD1Databases: vi.fn(() => [
          { database_name: 'main-db', binding: 'MAIN_DB' },
          { binding: 'SECONDARY_DB' },
        ]),
      },
    }));
    vi.doMock('@cli/d1/WranglerD1', () => ({ WranglerD1: { executeSql: vi.fn() } }));
    vi.doMock('@node-singletons/crypto', () => ({ randomUUID: vi.fn(() => 'uuid-1') }));
    vi.doMock('@node-singletons/fs', () => ({ default: { existsSync: vi.fn(() => false) } }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: { create: vi.fn() },
    }));

    const { LocalD1Resolver } = await import('../../../../src/cli/d1/LocalD1Resolver');

    expect(() => LocalD1Resolver.resolveD1Binding('/repo', 'missing')).toThrow(
      /Configured D1 targets: database_name=main-db, binding=MAIN_DB \\| binding=SECONDARY_DB/
    );
  });

  it('ensures local D1 readiness using the resolved database name', async () => {
    const executeSql = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));
    vi.doMock('@cli/d1/WranglerConfig', () => ({
      WranglerConfig: {
        getD1Database: vi.fn(() => ({ database_name: 'd1-proxy-db', binding: 'ZIN_DB' })),
        getD1Databases: vi.fn(() => [{ database_name: 'd1-proxy-db', binding: 'ZIN_DB' }]),
      },
    }));
    vi.doMock('@cli/d1/WranglerD1', () => ({ WranglerD1: { executeSql } }));
    vi.doMock('@node-singletons/crypto', () => ({ randomUUID: vi.fn(() => 'uuid-2') }));
    vi.doMock('@node-singletons/fs', () => ({ default: { existsSync: vi.fn(() => false) } }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: { create: vi.fn() },
    }));

    const { LocalD1Resolver } = await import('../../../../src/cli/d1/LocalD1Resolver');

    const resolved = LocalD1Resolver.ensureLocalD1Ready('/repo', 'ZIN_DB');

    expect(resolved.databaseName).toBe('d1-proxy-db');
    expect(executeSql).toHaveBeenCalledWith({
      dbName: 'd1-proxy-db',
      isLocal: true,
      sql: 'SELECT 1',
    });
  });

  it('resolves the real Miniflare SQLite file and cleans up the probe token', async () => {
    const executeSql = vi.fn();
    const loggerInfo = vi.fn();
    const sqliteQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ name: '__zintrust_d1_probe' }] })
      .mockResolvedValueOnce({ rows: [{ token: 'zintrust-probe-uuid-3' }] });

    vi.doMock('@config/logger', () => ({
      Logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));
    vi.doMock('@cli/d1/WranglerConfig', () => ({
      WranglerConfig: {
        getD1Database: vi.fn(() => ({ database_name: 'd1-proxy-db', binding: 'ZIN_DB' })),
        getD1Databases: vi.fn(() => [{ database_name: 'd1-proxy-db', binding: 'ZIN_DB' }]),
      },
    }));
    vi.doMock('@cli/d1/WranglerD1', () => ({ WranglerD1: { executeSql } }));
    vi.doMock('@node-singletons/crypto', () => ({ randomUUID: vi.fn(() => 'uuid-3') }));
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync: vi.fn((candidatePath: string) =>
          candidatePath.includes('miniflare-D1DatabaseObject')
        ),
        readdirSync: vi.fn(() => ['abc.sqlite', 'abc.sqlite-wal', 'notes.txt']),
      },
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: {
        create: vi.fn(() => ({
          connect: vi.fn(async () => undefined),
          query: sqliteQuery,
          disconnect: vi.fn(async () => undefined),
        })),
      },
    }));

    const { LocalD1Resolver } = await import('../../../../src/cli/d1/LocalD1Resolver');

    const resolvedPath = await LocalD1Resolver.resolveLocalD1SqlitePath('/repo', 'd1-proxy-db');

    expect(resolvedPath).toContain('miniflare-D1DatabaseObject/abc.sqlite');
    expect(executeSql).toHaveBeenNthCalledWith(1, {
      dbName: 'd1-proxy-db',
      isLocal: true,
      sql: 'SELECT 1',
    });
    expect(executeSql).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dbName: 'd1-proxy-db',
        isLocal: true,
      })
    );
    expect(executeSql).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dbName: 'd1-proxy-db',
        isLocal: true,
        sql: "DELETE FROM __zintrust_d1_probe WHERE token = 'zintrust-probe-uuid-3';",
      })
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('Resolved Wrangler local D1 SQLite path')
    );
  });

  it('warns on cleanup failure and throws when no candidate file matches the probe', async () => {
    const executeSql = vi
      .fn()
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => {
        throw new Error('cleanup failed');
      });
    const loggerWarn = vi.fn();
    const sqliteQuery = vi.fn().mockResolvedValue({ rows: [] });

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: loggerWarn, error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));
    vi.doMock('@cli/d1/WranglerConfig', () => ({
      WranglerConfig: {
        getD1Database: vi.fn(() => ({ binding: 'ZIN_DB' })),
        getD1Databases: vi.fn(() => [{ binding: 'ZIN_DB' }]),
      },
    }));
    vi.doMock('@cli/d1/WranglerD1', () => ({ WranglerD1: { executeSql } }));
    vi.doMock('@node-singletons/crypto', () => ({ randomUUID: vi.fn(() => 'uuid-4') }));
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync: vi.fn((candidatePath: string) =>
          candidatePath.includes('miniflare-D1DatabaseObject')
        ),
        readdirSync: vi.fn(() => ['abc.sqlite']),
      },
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: {
        create: vi.fn(() => ({
          connect: vi.fn(async () => undefined),
          query: sqliteQuery,
          disconnect: vi.fn(async () => undefined),
        })),
      },
    }));

    const { LocalD1Resolver } = await import('../../../../src/cli/d1/LocalD1Resolver');

    await expect(LocalD1Resolver.resolveLocalD1SqlitePath('/repo', 'ZIN_DB')).rejects.toThrow(
      /Unable to resolve actual local D1 SQLite file/
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      '[LocalD1Resolver] Failed to remove D1 probe token: Error: cleanup failed'
    );
  });

  it('treats SQLite probe read failures as non-matches', async () => {
    const executeSql = vi.fn(() => '');

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));
    vi.doMock('@cli/d1/WranglerConfig', () => ({
      WranglerConfig: {
        getD1Database: vi.fn(() => ({ database_name: 'd1-proxy-db' })),
        getD1Databases: vi.fn(() => [{ database_name: 'd1-proxy-db' }]),
      },
    }));
    vi.doMock('@cli/d1/WranglerD1', () => ({ WranglerD1: { executeSql } }));
    vi.doMock('@node-singletons/crypto', () => ({ randomUUID: vi.fn(() => 'uuid-5') }));
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync: vi.fn((candidatePath: string) =>
          candidatePath.includes('miniflare-D1DatabaseObject')
        ),
        readdirSync: vi.fn(() => ['abc.sqlite']),
      },
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: {
        create: vi.fn(() => ({
          connect: vi.fn(async () => undefined),
          query: vi.fn(async () => {
            throw new Error('read failed');
          }),
          disconnect: vi.fn(async () => undefined),
        })),
      },
    }));

    const { LocalD1Resolver } = await import('../../../../src/cli/d1/LocalD1Resolver');

    await expect(LocalD1Resolver.resolveLocalD1SqlitePath('/repo', 'd1-proxy-db')).rejects.toThrow(
      /Unable to resolve actual local D1 SQLite file/
    );
  });
});
