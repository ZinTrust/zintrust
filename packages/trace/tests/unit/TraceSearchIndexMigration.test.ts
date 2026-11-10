import { describe, expect, it, vi } from 'vitest';

vi.mock('@zintrust/core/database', () => ({
  MigrationSchema: {
    create: (db: { query: (sql: string, params: unknown[]) => Promise<unknown[]> }) => ({
      hasTable: async (name: string) =>
        (await db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name]))
          .length > 0,
    }),
  },
}));

import { TraceStorage } from '../../src/storage/TraceStorage';
import type { TraceSearchField } from '../../src/types';
import { migration } from '../../migrations/20261109120000_add_zin_trace_entries_search_index';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DB = require('better-sqlite3') as new (file: string) => SqliteConnection;

type SqliteStatement = {
  reader: boolean;
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};
type SqliteConnection = { prepare: (sql: string) => SqliteStatement; close: () => void };

const HAS_NATIVE_SQLITE = (() => {
  try {
    new DB(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

const createSqliteDb = (driver = 'sqlite') => {
  const conn = new DB(':memory:');
  const run = (sql: string, params: unknown[] = []) => {
    const stmt = conn.prepare(sql);
    return stmt.reader ? stmt.all(...params) : (stmt.run(...params), []);
  };
  const db = {
    getType: () => driver,
    query: async (sql: string, params: unknown[] = []) => run(sql, params),
    queryOne: async (sql: string, params: unknown[] = []) => run(sql, params)[0],
    execute: async (sql: string, params: unknown[] = []) => {
      run(sql, params);
      return { rows: [], affectedRows: 0 };
    },
  };
  return { conn, db };
};

const createEntriesTables = (conn: SqliteConnection): void => {
  conn
    .prepare(
      `CREATE TABLE zin_trace_entries (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       uuid TEXT NOT NULL UNIQUE,
       batch_id TEXT NOT NULL,
       family_hash TEXT,
       type TEXT NOT NULL,
       content TEXT NOT NULL,
       summary TEXT,
       is_latest INTEGER DEFAULT 1,
       created_at INTEGER NOT NULL
     )`
    )
    .run();
  conn
    .prepare('CREATE TABLE zin_trace_entries_tags (entry_uuid TEXT NOT NULL, tag TEXT NOT NULL)')
    .run();
};

const insertEntry = (
  conn: SqliteConnection,
  uuid: string,
  content: Record<string, unknown>,
  createdAt: number
): void => {
  conn
    .prepare(
      'INSERT INTO zin_trace_entries (uuid, batch_id, family_hash, type, content, summary, is_latest, created_at) VALUES (?, ?, NULL, ?, ?, NULL, 1, ?)'
    )
    .run(uuid, 'batch-1', 'http', JSON.stringify(content), createdAt);
};

const seedEntries = (conn: SqliteConnection): void => {
  insertEntry(conn, 'u1', { payload: 'alpha timeout here', uri: '/api/users' }, 1);
  insertEntry(conn, 'u2', { responseBody: 'ok timeout', error: 'boom' }, 2);
  insertEntry(conn, 'u3', { uri: '/x/Timeout', message: 'Gateway' }, 3);
  insertEntry(conn, 'u4', { sql: 'select * from users' }, 4);
  insertEntry(conn, 'u5', { message: 'he said "hi" there' }, 5);
};

const searchUuids = async (
  db: unknown,
  search: string,
  searchFields?: TraceSearchField[]
): Promise<string[]> => {
  const storage = TraceStorage.resolveStorage(db as never);
  const { data } = await storage.queryEntries({ page: 1, perPage: 50, search, searchFields });
  return data.map((entry) => entry.uuid);
};

const migrate = async (db: unknown): Promise<void> => {
  await migration.up(db as never);
};

const ftsRowCount = (conn: SqliteConnection): number =>
  (conn.prepare('SELECT COUNT(*) AS cnt FROM zin_trace_entries_search').get() as { cnt: number })
    .cnt;

const triggerNames = (conn: SqliteConnection): string[] =>
  (
    conn
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);

describe.skipIf(!HAS_NATIVE_SQLITE)('AddZinTraceEntriesSearchIndex migration (real sqlite)', () => {
  it('backfills existing rows and answers searches through the FTS index', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);

    await migrate(db);

    expect(await searchUuids(db, 'timeout')).toEqual(['u3', 'u2', 'u1']);
    expect(await searchUuids(db, 'timeout', ['response'])).toEqual(['u2']);
    expect(await searchUuids(db, 'timeout', ['url'])).toEqual(['u3']);
    expect(await searchUuids(db, 'users', ['request'])).toEqual([]);
    expect(await searchUuids(db, 'users', ['url', 'sql'])).toEqual(['u4', 'u1']);
    expect(await searchUuids(db, 'said "hi"', ['error'])).toEqual(['u5']);
    expect(ftsRowCount(conn)).toBe(5);
    conn.close();
  });

  it('falls back to LIKE when the FTS index is missing', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);

    expect(await searchUuids(db, 'timeout', ['response'])).toEqual(['u2']);
    expect(await searchUuids(db, 'timeout')).toEqual(['u3', 'u2', 'u1']);
    conn.close();
  });

  it('falls back to LIKE for terms shorter than three characters', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);
    await migrate(db);

    expect(await searchUuids(db, 'ok')).toEqual(['u2']);
    conn.close();
  });

  it('keeps the index in sync for inserts, content updates, and deletes', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);
    await migrate(db);

    insertEntry(conn, 'u6', { payload: 'fresh retry logic' }, 6);
    expect(await searchUuids(db, 'retry')).toEqual(['u6']);

    conn
      .prepare('UPDATE zin_trace_entries SET content = ? WHERE uuid = ?')
      .run(JSON.stringify({ payload: 'now retry only' }), 'u1');
    expect(await searchUuids(db, 'timeout', ['request'])).toEqual([]);
    expect(await searchUuids(db, 'retry', ['request'])).toEqual(['u6', 'u1']);

    conn.prepare('DELETE FROM zin_trace_entries WHERE uuid = ?').run('u4');
    expect(await searchUuids(db, 'select')).toEqual([]);
    expect(ftsRowCount(conn)).toBe(5);
    conn.close();
  });

  it('is idempotent when run again over an indexed table', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);
    await migrate(db);
    await migrate(db);

    expect(ftsRowCount(conn)).toBe(5);
    expect(await searchUuids(db, 'timeout')).toEqual(['u3', 'u2', 'u1']);
    conn.close();
  });

  it('rebuilds the index if the FTS table is missing but its triggers remain', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);
    await migrate(db);

    conn.prepare('DROP TABLE zin_trace_entries_search').run();
    expect(triggerNames(conn)).toHaveLength(3);

    await migrate(db);

    expect(ftsRowCount(conn)).toBe(5);
    expect(await searchUuids(db, 'timeout')).toEqual(['u3', 'u2', 'u1']);
    insertEntry(conn, 'u6', { payload: 'fresh retry logic' }, 6);
    expect(await searchUuids(db, 'retry')).toEqual(['u6']);
    conn.close();
  });

  it('drops the triggers and the search table on down', async () => {
    const { conn, db } = createSqliteDb();
    createEntriesTables(conn);
    seedEntries(conn);
    await migrate(db);
    expect(triggerNames(conn)).toHaveLength(3);

    await migration.down(db as never);

    expect(triggerNames(conn)).toEqual([]);
    const tables = conn
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'zin_trace_entries_search'"
      )
      .all();
    expect(tables).toEqual([]);
    conn.close();
  });

  it('does nothing for drivers other than sqlite-family', async () => {
    const { conn, db } = createSqliteDb('mysql');
    createEntriesTables(conn);
    const execute = vi.spyOn(db, 'execute');

    await migration.up(db as never);
    await migration.down(db as never);

    expect(execute).not.toHaveBeenCalled();
    conn.close();
  });
});
