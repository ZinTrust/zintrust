import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  Logger: loggerMock,
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    logging: {
      enabled: true,
      level: 'debug',
    },
  },
}));

let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

(HAS_NATIVE_SQLITE ? describe : describe.skip)('SQLiteAdapter trace logging guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips debug query logs for trace storage writes', async () => {
    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await adapter.connect();
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS zin_trace_entries (uuid TEXT, batch_id TEXT, family_hash TEXT, type TEXT, content TEXT, is_latest INTEGER, created_at INTEGER)',
      []
    );
    vi.clearAllMocks();

    await adapter.query(
      'INSERT INTO zin_trace_entries (uuid, batch_id, family_hash, type, content, is_latest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['u1', 'b1', 'f1', 'log', '{}', 1, Date.now()]
    );

    expect(loggerMock.debug).not.toHaveBeenCalledWith(
      'SQLite query executed',
      expect.objectContaining({
        sql: expect.stringContaining('zin_trace_entries'),
      })
    );
  });

  it('still logs normal sqlite queries when query logging is enabled', async () => {
    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await adapter.connect();
    vi.clearAllMocks();

    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);

    expect(loggerMock.debug).toHaveBeenCalledWith(
      'SQLite query executed',
      expect.objectContaining({
        sql: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)',
      })
    );
  });
});
