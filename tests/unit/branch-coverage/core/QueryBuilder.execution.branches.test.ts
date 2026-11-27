/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it, vi } from 'vitest';

const makeDb = (type?: string) => {
  const query = vi.fn(async () => [] as any[]);
  const execute = vi.fn(async () => ({ rowCount: 1, rows: [] as any[], lastInsertId: undefined }));
  return {
    db: { query, execute, getType: () => type } as any,
    query,
    execute,
  };
};

describe('QueryBuilder execution branch coverage', () => {
  it('uses default and custom firstOrFail messages', async () => {
    const { db } = makeDb('sqlite');
    await expect(QueryBuilder.create('users', db).firstOrFail()).rejects.toThrow(
      /Resource not found/i
    );
    await expect(QueryBuilder.create('users', db).firstOrFail('Nothing here')).rejects.toThrow(
      'Nothing here'
    );
  });

  it('falls back to zero when a count query has no rows', async () => {
    const { db, query } = makeDb('sqlite');
    await expect(QueryBuilder.create('users', db).count()).resolves.toBe(0);
    expect(query.mock.calls[0]?.[0]).toContain('COUNT(*) as count');
  });

  it('rejects empty inserts and empty update payloads', async () => {
    const { db } = makeDb('postgresql');
    await expect(QueryBuilder.create('users', db).insert([])).rejects.toThrow(
      /INSERT requires at least one column/i
    );
    await expect(QueryBuilder.create('users', db).insert({})).rejects.toThrow(
      /INSERT requires at least one column/i
    );
    await expect(
      QueryBuilder.create('users', db).where('id', '=', 1).update({})
    ).rejects.toThrow(/UPDATE requires at least one column/i);
  });

  it('reports unsupported insertIfAbsent dialects including unknown', async () => {
    const sqlServer = makeDb('sqlserver');
    await expect(
      QueryBuilder.create('claims', sqlServer.db).insertIfAbsent({ ref: 'a' })
    ).rejects.toThrow(/not supported for the sqlserver database driver/i);

    const unknown = makeDb(undefined);
    await expect(
      QueryBuilder.create('claims', unknown.db).insertIfAbsent({ ref: 'b' })
    ).rejects.toThrow(/not supported for the unknown database driver/i);
  });

  it('requires a database instance for paginate', async () => {
    await expect(
      QueryBuilder.create('users').paginate(1, 10)
    ).rejects.toThrow(/Database instance not provided/i);
  });

  it('normalizes bigint and invalid pagination totals', async () => {
    const bigintDb = makeDb('sqlite');
    bigintDb.query.mockResolvedValue([{ total: 12n }]);
    const bigintPage = await QueryBuilder.create('users', bigintDb.db).paginate(1, 5);
    expect(bigintPage.total).toBe(12);

    const invalidDb = makeDb('sqlite');
    invalidDb.query.mockResolvedValue([{ total: 'not-a-number' }]);
    const invalidPage = await QueryBuilder.create('users', invalidDb.db).paginate(2, 5);
    expect(invalidPage.total).toBe(0);

    await expect(
      QueryBuilder.create('users', invalidDb.db).paginate(0, 5)
    ).rejects.toThrow(/page must be a positive integer/i);
    await expect(
      QueryBuilder.create('users', invalidDb.db).paginate(1, -5)
    ).rejects.toThrow(/perPage must be a positive integer/i);
  });

  it('falls back to null ids for RETURNING results without rows', async () => {
    const { db } = makeDb('postgresql');
    const insert = await QueryBuilder.create('users', db)
      .return(['id'])
      .insert({ name: 'A' });
    expect(insert.id).toBeNull();

    const insertIfAbsent = await QueryBuilder.create('claims', db)
      .return('id')
      .insertIfAbsent({ ref: 'x' });
    expect((insertIfAbsent as any).id).toBeNull();
  });

  it('falls back to item ids when no lastInsertId is returned', async () => {
    const { db } = makeDb('sqlite');
    const result = await QueryBuilder.create('users', db).insert({ id: null, name: 'A' });
    expect(result.id).toBeNull();

    const absent = await QueryBuilder.create('users', db).insertIfAbsent({ id: 5, name: 'B' });
    expect((absent as any).id).toBe(5);
  });

  it('covers returning nullish and string column forms', async () => {
    expect(QueryBuilder.create('users').return(undefined).toSQL()).toContain('SELECT');
    expect(QueryBuilder.create('users').return(null as any).toSQL()).toContain('SELECT');
    expect(() => QueryBuilder.create('users').return([])).toThrow(
      /RETURNING requires at least one column/i
    );
    expect(QueryBuilder.create('users').return('id').toSQL()).toContain('SELECT');
  });
});
