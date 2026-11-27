/* eslint-disable no-empty-function -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  all: vi.fn((_sql: string) => [] as unknown[]),
  run: vi.fn(() => ({ changes: 1, lastInsertRowid: 7 })),
  pragma: vi.fn(),
  close: vi.fn(),
  filenames: [] as string[],
  preparedSql: [] as string[],
  envRoot: '',
  logEnabled: true,
  rawEnabled: true,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: (...args: unknown[]) => m.debug(...args),
    info: (...args: unknown[]) => m.info(...args),
    warn: (...args: unknown[]) => m.warn(...args),
    error: vi.fn(),
    withTraceSkipContext: (ctx: unknown) => ctx,
  },
}));

vi.mock('@node-singletons/fs', () => ({
  default: { mkdirSync: (...args: unknown[]) => m.mkdirSync(...args) },
}));

vi.mock('@config/database', () => ({
  databaseConfig: { logging: { get enabled() { return m.logEnabled; } } },
}));

vi.mock('@config/env', () => ({
  Env: { get ZINTRUST_PROJECT_ROOT() { return m.envRoot; } },
}));

vi.mock('@config/features', () => ({
  FeatureFlags: { isRawQueryEnabled: () => m.rawEnabled },
}));

const installDriver = () => {
  vi.doMock('better-sqlite3', () => ({
    default: class FakeSqliteDatabase {
      public constructor(filename: string) {
        m.filenames.push(filename);
      }

      public prepare(sql: string) {
        m.preparedSql.push(sql);
        return {
          all: (...args: unknown[]) => m.all(sql, ...args),
          run: (...args: unknown[]) => m.run(sql, ...args),
        };
      }

      public pragma(value: string) {
        m.pragma(value);
      }

      public close() {
        m.close();
      }
    },
  }));
};

const load = async () => {
  vi.resetModules();
  installDriver();
  const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
  return SQLiteAdapter;
};

describe('SQLiteAdapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.filenames.length = 0;
    m.preparedSql.length = 0;
    m.envRoot = '';
    m.logEnabled = true;
    m.rawEnabled = true;
    m.all.mockImplementation(() => []);
    m.run.mockReturnValue({ changes: 1, lastInsertRowid: 7 });
    delete (globalThis as unknown as { __zintrustSqliteDriver?: string })
      .__zintrustSqliteDriver;
  });

  afterEach(() => {
    delete (globalThis as unknown as { __zintrustSqliteDriver?: string })
      .__zintrustSqliteDriver;
    vi.doUnmock('better-sqlite3');
    vi.doUnmock('fake-sqlite-driver');
  });

  it('normalizes filenames, creates directories only for file-backed databases', async () => {
    const SQLiteAdapter = await load();

    const memory = SQLiteAdapter.create({ database: '' } as never);
    await memory.connect();
    expect(m.filenames).toEqual([':memory:']);
    expect(m.mkdirSync).not.toHaveBeenCalled();

    const absolute = SQLiteAdapter.create({ database: '/tmp/absolute.sqlite' } as never);
    await absolute.connect();
    expect(m.filenames[1]).toBe('/tmp/absolute.sqlite');
    expect(m.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });

    const windows = SQLiteAdapter.create({ database: 'C:\\data\\app.sqlite' } as never);
    await windows.connect();
    expect(m.filenames[2]).toBe('C:\\data\\app.sqlite');

    m.envRoot = '/project/root';
    const relative = SQLiteAdapter.create({ database: 'relative.sqlite' } as never);
    await relative.connect();
    expect(m.filenames[3]).toBe('/project/root/relative.sqlite');
  });

  it('reports failures to create the database directory', async () => {
    const SQLiteAdapter = await load();
    m.mkdirSync.mockImplementationOnce(() => {
      throw new Error('mkdir failed');
    });

    const adapter = SQLiteAdapter.create({ database: '/tmp/nope/app.sqlite' } as never);
    await expect(adapter.connect()).rejects.toThrow(/Failed to create SQLite database directory/);
  });

  it('connects and disconnects only once', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);

    await adapter.connect();
    await adapter.connect();
    expect(m.filenames).toHaveLength(1);
    expect(m.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    await adapter.disconnect();
    expect(m.close).toHaveBeenCalledTimes(1);
    expect(adapter.isConnected()).toBe(false);
  });

  it('executes select/pragma queries and mutating statements with logging toggles', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);
    await adapter.connect();

    m.all.mockReturnValueOnce([{ id: 1 }]);
    await expect(adapter.query('SELECT * FROM t', [1])).resolves.toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
    });
    expect(m.debug).toHaveBeenCalledWith('SQLite query executed', expect.any(Object));

    m.all.mockReturnValueOnce([]);
    await expect(adapter.query('PRAGMA table_info(t)', [])).resolves.toEqual({
      rows: [],
      rowCount: 0,
    });

    m.run.mockReturnValueOnce({ changes: 3, lastInsertRowid: BigInt(11) });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toEqual({
      rows: [],
      rowCount: 3,
      lastInsertId: BigInt(11),
    });

    m.logEnabled = false;
    m.all.mockReturnValueOnce([]);
    await adapter.query('SELECT 1', []);
    expect(m.debug).toHaveBeenCalledTimes(3);
  });

  it('wraps query errors and handles queryOne/ping defaults', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);

    await expect(adapter.query('SELECT 1')).rejects.toThrow(/not connected/i);
    await adapter.connect();

    m.all.mockImplementationOnce(() => {
      throw new Error('select failed');
    });
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/Query failed/);

    m.all.mockReturnValueOnce([]);
    await expect(adapter.queryOne('SELECT 1')).resolves.toBeNull();

    m.all.mockReturnValueOnce([{ a: 1 }, { a: 2 }]);
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toEqual({ a: 1 });

    m.all.mockReturnValueOnce([]);
    await expect(adapter.ping()).resolves.toBeUndefined();
    expect(adapter.getType()).toBe('sqlite');
    expect(adapter.getPlaceholder(1)).toBe('?');
  });

  it('guards raw queries, supports both read/write commands, and skips trace log warnings', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);

    m.rawEnabled = false;
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/disabled/i);
    m.rawEnabled = true;
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/not connected/i);

    await adapter.connect();
    m.all.mockReturnValueOnce([{ x: 1 }]);
    await expect(adapter.rawQuery('SELECT 1', [1])).resolves.toEqual([{ x: 1 }]);
    expect(m.warn).toHaveBeenCalled();

    m.run.mockReturnValueOnce({ changes: 1, lastInsertRowid: 2 });
    await expect(adapter.rawQuery('DELETE FROM t')).resolves.toEqual([]);

    m.all.mockReturnValueOnce([]);
    await expect(adapter.rawQuery('SELECT * FROM zin_trace_entries')).resolves.toEqual([]);
    expect(m.warn).toHaveBeenCalledTimes(2);

    m.all.mockImplementationOnce(() => {
      throw new Error('raw failed');
    });
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/Raw query failed/);
  });

  it('drains tables during resetSchema, ignoring missing/invalid names', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);
    await adapter.connect();

    await expect(adapter.ensureMigrationsTable!()).resolves.toBeUndefined();
    expect(m.preparedSql.at(-1)).toContain('CREATE TABLE IF NOT EXISTS migrations');

    m.all.mockImplementation((sql: string) =>
      sql.includes('sqlite_master')
        ? [{ name: 'users' }, { name: '' }, { name: 42 }, { name: 'drop_me' }]
        : []
    );
    await adapter.resetSchema!();
    expect(m.preparedSql).toContainEqual(expect.stringContaining('DROP TABLE IF EXISTS "users"'));
    expect(m.preparedSql.at(-5)).toBe('PRAGMA foreign_keys = OFF');
    expect(m.preparedSql.at(-1)).toBe('PRAGMA foreign_keys = ON');
  });

  it('rejects unsafe sqlite identifiers during resetSchema', async () => {
    const SQLiteAdapter = await load();
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);
    await adapter.connect();

    m.all.mockImplementation((sql: string) =>
      sql.includes('sqlite_master') ? [{ name: 'users; DROP TABLE t' }] : []
    );
    await expect(adapter.resetSchema!()).rejects.toThrow(/Unsafe sqlite identifier/);
  });

  it('honors a custom driver package from global configuration', async () => {
    vi.resetModules();
    (globalThis as unknown as { __zintrustSqliteDriver?: string }).__zintrustSqliteDriver =
      'fake-sqlite-driver';
    vi.doMock('fake-sqlite-driver', () => ({
      default: class {
        public constructor(public readonly filename: string) {}

        public prepare() {
          return { all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) };
        }

        public pragma() {}

        public close() {}
      },
    }));

    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ database: ':memory:' } as never);
    await expect(adapter.connect()).resolves.toBeUndefined();
    await adapter.disconnect();
  });

  it('maps missing-package import errors and wraps other failures', async () => {
    const loadWithImportError = async (makeError: () => unknown) => {
      vi.resetModules();
      vi.doMock('better-sqlite3', () => {
        const error = makeError();
        return {
          get default() {
            throw error;
          },
        } as never;
      });
      const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
      return SQLiteAdapter.create({ database: ':memory:' } as never);
    };

    const missingByEmptyMessage = await loadWithImportError(() => {
      const error = new Error('');
      Object.assign(error, { code: 'ERR_MODULE_NOT_FOUND' });
      return error;
    });
    await expect(missingByEmptyMessage.connect()).rejects.toThrow(/requires the 'better-sqlite3'/);

    const missingByMessage = await loadWithImportError(
      () => new Error("Cannot find package 'better-sqlite3' imported")
    );
    await expect(missingByMessage.connect()).rejects.toThrow(/requires the 'better-sqlite3'/);

    const otherError = await loadWithImportError(() => new Error('permission denied'));
    await expect(otherError.connect()).rejects.toThrow(/Failed to load SQLite driver/);
  });
});
