/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const scope = {
    peek: vi.fn(() => undefined as unknown),
    run: vi.fn(async (_handle: unknown, fn: () => Promise<unknown>) => fn()),
  };
  return {
    getD1Binding: vi.fn(),
    rawEnabled: vi.fn(() => true),
    scope,
    openSession: vi.fn(() => null as unknown),
    sessionDb: { prepare: vi.fn() },
    handle: { db: {} as unknown, getBookmark: vi.fn(() => 'bookmark-1') },
  };
});

vi.mock('@config/cloudflare', () => ({
  Cloudflare: { getD1Binding: (...args: unknown[]) => m.getD1Binding(...args) },
}));

vi.mock('@config/features', () => ({
  FeatureFlags: { isRawQueryEnabled: () => m.rawEnabled() },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withTraceSkipContext: (ctx: unknown) => ctx,
  },
}));

vi.mock('@orm/adapters/D1ReadSession', () => ({
  createReadSessionScope: () => m.scope,
  openSession: (...args: unknown[]) => (m.openSession as (...a: any[]) => any)(...args),
}));

import { D1Adapter } from '@/orm/adapters/D1Adapter';
import type { IDatabaseAdapter } from '@/orm/DatabaseAdapter';

type Stmt = {
  bind: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
};

const makeDb = () => {
  const stmt: Stmt = {
    bind: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    first: vi.fn(),
  };
  stmt.bind.mockImplementation(() => stmt);
  const db = {
    prepare: vi.fn(() => stmt),
    batch: vi.fn(),
    withSession: vi.fn(),
  };
  return { db, stmt };
};

const connected = async (db: unknown): Promise<IDatabaseAdapter> => {
  m.getD1Binding.mockReturnValue(db);
  const adapter = D1Adapter.create({} as never);
  await adapter.connect();
  return adapter;
};

describe('D1Adapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getD1Binding.mockReturnValue(null);
    m.rawEnabled.mockReturnValue(true);
    m.scope.peek.mockReturnValue(undefined);
    m.scope.run.mockImplementation(async (_handle, fn) => fn());
    m.openSession.mockReturnValue(null);
    m.sessionDb.prepare.mockClear();
    m.handle.getBookmark.mockReturnValue('bookmark-1');
  });

  it('routes all mutating statements through .run and extracts metadata variants', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    for (const sql of [
      'INSERT INTO t VALUES (1)',
      '  update t set a = 1',
      'DELETE FROM t',
      'CREATE TABLE t (id INTEGER)',
      'DROP TABLE t',
      'ALTER TABLE t ADD COLUMN b TEXT',
      'REPLACE INTO t VALUES (2)',
    ]) {
      stmt.run.mockResolvedValueOnce({
        success: true,
        meta: { changes: 2, lastRowId: '7', served_by_primary: false, served_by_region: '' },
      });
      const result = await adapter.query(sql, [1, new Date('2020-01-01T00:00:00Z'), { a: 1 }]);
      expect(result.rowCount).toBe(2);
      expect(result.lastInsertId).toBe('7');
      expect(result).toMatchObject({ servedByPrimary: false });
      expect(result).not.toHaveProperty('servedByRegion');
      expect(stmt.bind).toHaveBeenLastCalledWith(
        '1',
        '2020-01-01T00:00:00.000Z',
        JSON.stringify({ a: 1 })
      );
    }

    stmt.run.mockResolvedValueOnce({ success: true, meta: { rows_written: 3 } });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toMatchObject({
      rowCount: 3,
    });

    stmt.run.mockResolvedValueOnce({ success: true, meta: { rows_read: 4 } });
    await expect(adapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({ rowCount: 4 });

    stmt.run.mockResolvedValueOnce({ success: true, meta: {} });
    await expect(adapter.query('DELETE FROM t', [])).resolves.toMatchObject({ rowCount: 0 });

    for (const key of ['last_row_id', 'lastInsertRowid', 'last_insert_rowid']) {
      stmt.run.mockResolvedValueOnce({ success: true, meta: { changes: 1, [key]: 11 } });
      await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toMatchObject({
        lastInsertId: 11,
      });
    }

    stmt.run.mockResolvedValueOnce({ success: true, meta: { lastRowId: { bad: true } } });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toMatchObject({
      lastInsertId: undefined,
    });

    stmt.run.mockResolvedValueOnce({
      success: true,
      meta: { served_by_primary: true, served_by_region: 'eu-west' },
    });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toMatchObject({
      servedByPrimary: true,
      servedByRegion: 'eu-west',
    });
  });

  it('rejects failed run/all results and non-object metadata', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    stmt.run.mockResolvedValueOnce({ success: false, error: 'run failed' });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).rejects.toThrow(/D1 query failed/);

    stmt.run.mockResolvedValueOnce({ success: false });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).rejects.toThrow(
      /D1 query failed/
    );

    stmt.all.mockResolvedValueOnce({ success: false, error: 'all failed' });
    await expect(adapter.query('SELECT * FROM t', [])).rejects.toThrow(/D1 query failed/);

    stmt.all.mockResolvedValueOnce({ success: false });
    await expect(adapter.query('SELECT * FROM t', [])).rejects.toThrow(/D1 query failed/);

    stmt.all.mockResolvedValueOnce({ results: [], meta: 'not-an-object' });
    await expect(adapter.query('SELECT * FROM t', [])).resolves.toMatchObject({ rowCount: 0 });

    stmt.run.mockResolvedValueOnce({ success: true, meta: null });
    await expect(adapter.query('INSERT INTO t VALUES (1)', [])).resolves.toMatchObject({
      rowCount: 0,
    });
  });

  it('uses .all for selects and mutating statements with RETURNING', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    stmt.all.mockResolvedValueOnce({ results: [{ id: 1 }, { id: 2 }], meta: { changes: 9 } });
    await expect(adapter.query('SELECT * FROM t', [])).resolves.toMatchObject({
      rowCount: 2,
      affectedRows: 9,
    });

    stmt.all.mockResolvedValueOnce({ meta: { changes: 5 } });
    await expect(adapter.query('SELECT * FROM t', [])).resolves.toMatchObject({
      rows: [],
      rowCount: 5,
    });

    stmt.all.mockResolvedValueOnce({ results: [{ id: 3 }], meta: { changes: 1 } });
    await expect(adapter.query('INSERT INTO t VALUES (1) RETURNING id', [])).resolves.toMatchObject({
      rowCount: 1,
    });
    expect(stmt.run).not.toHaveBeenCalled();
  });

  it('handles queryOne, ping and binding errors', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    stmt.first.mockResolvedValueOnce(null);
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toBeNull();

    stmt.first.mockResolvedValueOnce({ id: 1 });
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toEqual({ id: 1 });

    stmt.first.mockRejectedValueOnce(new Error('first failed'));
    await expect(adapter.queryOne('SELECT 1', [])).rejects.toThrow(/queryOne failed/);

    stmt.first.mockRejectedValueOnce(new Error('ping failed'));
    await expect(adapter.ping()).rejects.toThrow(/ping failed/);

    stmt.first.mockResolvedValueOnce(null);
    await expect(adapter.ping()).resolves.toBeUndefined();

    m.getD1Binding.mockReturnValue(null);
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/binding not found/);
    await expect(adapter.ping()).rejects.toThrow(/binding not found/);
  });

  it('requires connection for every operation and rejects callback transactions', async () => {
    const adapter = D1Adapter.create({} as never);
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.queryOne('SELECT 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.ping()).rejects.toThrow(/not connected/i);
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/not connected/i);
    await expect(adapter.batch!([])).rejects.toThrow(/not connected/i);
    await expect(adapter.runReadSession!({}, async () => 1)).rejects.toThrow(/not connected/i);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getType()).toBe('d1');
    expect(adapter.getPlaceholder(1)).toBe('?');
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/does not support/i);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('validates batch support and converts batch results', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    m.getD1Binding.mockReturnValue(null);
    await expect(adapter.batch!([])).rejects.toThrow(/binding not found/);

    m.getD1Binding.mockReturnValue({ prepare: vi.fn() });
    await expect(adapter.batch!([])).rejects.toThrow(/does not support atomic batches/i);

    m.getD1Binding.mockReturnValue(db);
    stmt.bind.mockImplementation(() => stmt);
    db.batch.mockResolvedValueOnce([
      { success: false, error: 'batch failed' },
      { success: false },
    ]);
    await expect(adapter.batch!([{ sql: 'SELECT 1' }])).rejects.toThrow(/batch failed/);

    db.batch.mockResolvedValueOnce([{ success: false }]);
    await expect(adapter.batch!([{ sql: 'SELECT 1' }])).rejects.toThrow(/D1 atomic batch failed/);

    db.batch.mockRejectedValueOnce(new Error('network'));
    await expect(adapter.batch!([{ sql: 'SELECT 1' }])).rejects.toThrow(/batch failed/i);

    db.batch.mockResolvedValueOnce([
      {
        success: true,
        results: [{ id: 1 }],
        meta: { changes: 7, lastRowId: 12, served_by_primary: true, served_by_region: 'us' },
      },
      { success: true, meta: { changes: 2 } },
    ]);
    await expect(
      adapter.batch!([{ sql: 'SELECT 1', parameters: [2] }, { sql: 'UPDATE t SET a = 1' }])
    ).resolves.toMatchObject([
      {
        rows: [{ id: 1 }],
        rowCount: 1,
        affectedRows: 7,
        lastInsertId: 12,
        servedByPrimary: true,
        servedByRegion: 'us',
      },
      { rows: [], rowCount: 2 },
    ]);
  });

  it('runs read sessions directly or through an opened session handle', async () => {
    const { db } = makeDb();
    const adapter = await connected(db);

    m.getD1Binding.mockReturnValue(null);
    await expect(adapter.runReadSession!({}, async () => 1)).rejects.toThrow(/binding not found/);

    m.getD1Binding.mockReturnValue(db);
    m.openSession.mockReturnValue(null);
    await expect(adapter.runReadSession!({}, async () => 'direct')).resolves.toEqual({
      result: 'direct',
      bookmark: null,
    });

    m.handle.db = m.sessionDb;
    m.openSession.mockReturnValue(m.handle);
    m.scope.peek.mockReturnValue(m.handle);
    await expect(adapter.runReadSession!({}, async () => 'session')).resolves.toEqual({
      result: 'session',
      bookmark: 'bookmark-1',
    });
    expect(m.scope.run).toHaveBeenCalled();
  });

  it('guards and logs raw queries with normalized parameters', async () => {
    const { db, stmt } = makeDb();
    const adapter = await connected(db);

    m.rawEnabled.mockReturnValue(false);
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/disabled/i);

    m.rawEnabled.mockReturnValue(true);
    await adapter.disconnect();
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/not connected/i);
    await adapter.connect();

    stmt.all.mockResolvedValueOnce({ results: [{ x: 1 }] });
    await expect(adapter.rawQuery('SELECT 1', [1])).resolves.toEqual([{ x: 1 }]);
    expect(stmt.bind).toHaveBeenLastCalledWith('1');

    stmt.all.mockResolvedValueOnce({});
    await expect(adapter.rawQuery('SELECT 1')).resolves.toEqual([]);

    stmt.all.mockRejectedValueOnce(new Error('raw failed'));
    await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow(/Raw SQL query failed/);

    stmt.all.mockResolvedValueOnce({ results: [] });
    await expect(adapter.rawQuery('SELECT * FROM zin_trace_entries', [])).resolves.toEqual([]);

    await expect(adapter.query('SELECT 1', { notAnArray: true } as never)).rejects.toThrow(
      /D1 query failed/
    );
  });
});
