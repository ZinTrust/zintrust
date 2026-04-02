import { describe, expect, it, vi } from 'vitest';

import { DebuggerStorage } from '../../src/storage/DebuggerStorage';

type MockDb = {
  execute: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  queryOne: ReturnType<typeof vi.fn>;
};

const createDb = (): MockDb => {
  const entryRows = [
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
    if (sql.includes('FROM zin_debugger_entries e')) {
      return entryRows;
    }

    if (sql.includes('FROM zin_debugger_entries_tags WHERE entry_uuid IN')) {
      return tagRows;
    }

    if (sql.includes('FROM zin_debugger_entries_tags WHERE entry_uuid = ?')) {
      return tagRows.filter((row) => row.entry_uuid === 'entry-2').map((row) => ({ tag: row.tag }));
    }

    return [];
  });

  return {
    execute,
    query,
    queryOne,
  } as unknown as MockDb;
};

describe('DebuggerStorage', () => {
  it('creates a fresh facade per database instance', () => {
    const dbA = createDb();
    const dbB = createDb();

    const storageA = DebuggerStorage.resolveStorage(dbA);
    const storageB = DebuggerStorage.resolveStorage(dbB);

    expect(storageA).not.toBe(storageB);
  });

  it('hydrates tags when querying entries', async () => {
    const db = createDb();
    const storage = DebuggerStorage.resolveStorage(db);

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

  it('writes tags separately when persisting entries', async () => {
    const db = createDb();
    const storage = DebuggerStorage.resolveStorage(db);

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
      expect.stringContaining('INSERT INTO zin_debugger_entries'),
      ['entry-3', 'batch-2', 'hash-3', 'log', '{"message":"hello"}', 1, 30]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT OR IGNORE INTO zin_debugger_entries_tags'),
      ['entry-3', 'alpha']
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT OR IGNORE INTO zin_debugger_entries_tags'),
      ['entry-3', 'beta']
    );
  });

  it('prunes old entries without touching exception rows when requested', async () => {
    const db = createDb();
    const storage = DebuggerStorage.resolveStorage(db);

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
    const storage = DebuggerStorage.resolveStorage(db);

    await storage.clear();

    expect(db.execute).toHaveBeenCalledWith('DELETE FROM zin_debugger_entries', []);
  });
});
