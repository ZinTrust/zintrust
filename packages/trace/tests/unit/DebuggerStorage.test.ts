import { describe, expect, it, vi } from 'vitest';

import { TraceStorage } from '../../src/storage/TraceStorage';

type MockDb = {
  execute: ReturnType<typeof vi.fn>;
  getType: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  queryOne: ReturnType<typeof vi.fn>;
};

const createDb = (
  driver = 'sqlite',
  overrides?: {
    entryRows?: Array<{
      id: number;
      uuid: string;
      batch_id: string;
      family_hash: string | null;
      type: string;
      content: string;
      is_latest: number;
      created_at: number;
    }>;
  }
): MockDb => {
  const entryRows = overrides?.entryRows ?? [
    {
      id: 2,
      uuid: 'entry-2',
      batch_id: 'batch-1',
      family_hash: 'hash-2',
      type: 'log',
      content: JSON.stringify({ message: 'second' }),
      is_latest: 1,
      created_at: 20,
    },
    {
      id: 1,
      uuid: 'entry-1',
      batch_id: 'batch-1',
      family_hash: 'hash-1',
      type: 'cache',
      content: JSON.stringify({ message: 'first' }),
      is_latest: 0,
      created_at: 10,
    },
  ];

  const tagRows = [
    { entry_uuid: 'entry-1', tag: 'cache' },
    { entry_uuid: 'entry-2', tag: 'log' },
    { entry_uuid: 'entry-2', tag: 'latest' },
  ];

  const execute = vi.fn(async () => undefined);
  const queryOne = vi.fn(async (sql: string) => {
    if (sql.includes('COUNT(*) as cnt')) {
      return { cnt: 2 };
    }

    if (sql.includes('WHERE uuid = ?')) {
      return entryRows[0];
    }

    return null;
  });
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM zin_trace_entries e')) {
      return entryRows;
    }

    if (sql.includes('FROM zin_trace_entries_tags WHERE entry_uuid IN')) {
      return tagRows;
    }

    if (sql.includes('FROM zin_trace_entries_tags WHERE entry_uuid = ?')) {
      return tagRows.filter((row) => row.entry_uuid === 'entry-2').map((row) => ({ tag: row.tag }));
    }

    return [];
  });

  return {
    execute,
    getType: vi.fn(() => driver),
    query,
    queryOne,
  } as unknown as MockDb;
};

describe('TraceStorage', () => {
  it('creates a fresh facade per database instance', () => {
    const dbA = createDb();
    const dbB = createDb();

    const storageA = TraceStorage.resolveStorage(dbA);
    const storageB = TraceStorage.resolveStorage(dbB);

    expect(storageA).not.toBe(storageB);
  });

  it('hydrates tags when querying entries', async () => {
    const db = createDb();
    const storage = TraceStorage.resolveStorage(db);

    const result = await storage.queryEntries({ page: 1, perPage: 10, tag: 'log' });

    expect(result.total).toBe(2);
    expect(result.data).toEqual([
      expect.objectContaining({
        uuid: 'entry-2',
        tags: ['log', 'latest'],
        content: { message: 'second' },
      }),
      expect.objectContaining({
        uuid: 'entry-1',
        tags: ['cache'],
        content: { message: 'first' },
      }),
    ]);
  });

  it('summarizes request entries without returning heavy bodies in list mode', async () => {
    const db = createDb('sqlite', {
      entryRows: [
        {
          id: 3,
          uuid: 'entry-3',
          batch_id: 'batch-9',
          family_hash: 'hash-9',
          type: 'request',
          content: JSON.stringify({
            method: 'POST',
            uri: '/api/tasks',
            responseStatus: 201,
            duration: 143,
            hostname: 'app-node',
            middleware: ['auth', 'throttle'],
            payload: { large: 'x'.repeat(50_000) },
            responseBody: { nested: 'y'.repeat(50_000) },
          }),
          is_latest: 1,
          created_at: 30,
        },
      ],
    });
    const storage = TraceStorage.resolveStorage(db);

    const result = await storage.queryEntries({
      page: 1,
      perPage: 10,
      type: 'request',
      summary: true,
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        uuid: 'entry-3',
        type: 'request',
        content: {
          method: 'POST',
          uri: '/api/tasks',
          responseStatus: 201,
          duration: 143,
          hostname: 'app-node',
          middleware: ['auth', 'throttle'],
        },
      }),
    ]);
    expect(result.data[0].content).not.toHaveProperty('payload');
    expect(result.data[0].content).not.toHaveProperty('responseBody');
  });

  it('paginates batch entries by type and returns per-type counts', async () => {
    const db = createDb('sqlite', {
      entryRows: [
        {
          id: 1,
          uuid: 'cache-1',
          batch_id: 'batch-5',
          family_hash: null,
          type: 'cache',
          content: JSON.stringify({ operation: 'get', key: 'a' }),
          is_latest: 1,
          created_at: 10,
        },
        {
          id: 2,
          uuid: 'cache-2',
          batch_id: 'batch-5',
          family_hash: null,
          type: 'cache',
          content: JSON.stringify({ operation: 'get', key: 'b' }),
          is_latest: 1,
          created_at: 20,
        },
      ],
    });
    db.query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('GROUP BY type')) {
        return [
          { type: 'request', cnt: 1 },
          { type: 'cache', cnt: 12 },
          { type: 'query', cnt: 2 },
        ];
      }

      if (sql.includes('WHERE entry_uuid IN')) {
        return [];
      }

      if (sql.includes('FROM zin_trace_entries')) {
        expect(params).toEqual(['batch-5', 'cache', 2, 2]);
        return [
          {
            id: 3,
            uuid: 'cache-3',
            batch_id: 'batch-5',
            family_hash: null,
            type: 'cache',
            content: JSON.stringify({ operation: 'set', key: 'c' }),
            is_latest: 1,
            created_at: 30,
          },
          {
            id: 4,
            uuid: 'cache-4',
            batch_id: 'batch-5',
            family_hash: null,
            type: 'cache',
            content: JSON.stringify({ operation: 'set', key: 'd' }),
            is_latest: 1,
            created_at: 40,
          },
        ];
      }

      return [];
    });
    db.queryOne = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*) as cnt FROM zin_trace_entries WHERE batch_id = ? AND type = ?')) {
        return { cnt: 12 };
      }

      return null;
    });

    const storage = TraceStorage.resolveStorage(db);
    const result = await storage.queryBatchEntries('batch-5', {
      type: 'cache',
      page: 2,
      perPage: 2,
    });

    expect(result.counts).toEqual({ request: 1, cache: 12, query: 2 });
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(2);
    expect(result.entries).toEqual([
      expect.objectContaining({ uuid: 'cache-3', type: 'cache' }),
      expect.objectContaining({ uuid: 'cache-4', type: 'cache' }),
    ]);
  });

  it('writes tags separately when persisting entries', async () => {
    const db = createDb();
    const storage = TraceStorage.resolveStorage(db);

    await storage.writeEntry({
      uuid: 'entry-3',
      batchId: 'batch-2',
      familyHash: 'hash-3',
      type: 'log',
      content: { message: 'hello' },
      tags: ['alpha', 'beta'],
      isLatest: true,
      createdAt: 30,
    });

    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO zin_trace_entries'),
      ['entry-3', 'batch-2', 'hash-3', 'log', '{"message":"hello"}', 1, 30]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT OR IGNORE INTO zin_trace_entries_tags'),
      ['entry-3', 'alpha']
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT OR IGNORE INTO zin_trace_entries_tags'),
      ['entry-3', 'beta']
    );
  });

  it('prunes old entries without touching exception rows when requested', async () => {
    const db = createDb();
    const storage = TraceStorage.resolveStorage(db);

    const deleted = await storage.prune(100, true);

    expect(deleted).toBe(2);
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("AND type != 'exception'"),
      [100]
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("AND type != 'exception'"),
      [100]
    );
  });

  it('clears the entries table directly', async () => {
    const db = createDb();
    const storage = TraceStorage.resolveStorage(db);

    await storage.clear();

    expect(db.execute).toHaveBeenCalledWith('DELETE FROM zin_trace_entries', []);
  });

  it('uses MySQL-safe ignore inserts for tags and monitoring', async () => {
    const db = createDb('mysql');
    const storage = TraceStorage.resolveStorage(db as never);

    await storage.writeEntry({
      uuid: 'entry-4',
      batchId: 'batch-3',
      familyHash: 'hash-4',
      type: 'log',
      content: { message: 'mysql' },
      tags: ['mysql-tag'],
      isLatest: true,
      createdAt: 40,
    });
    await storage.addMonitoring('slow');

    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT IGNORE INTO zin_trace_entries_tags'),
      ['entry-4', 'mysql-tag']
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT IGNORE INTO zin_trace_monitoring'),
      ['slow']
    );
  });
});
