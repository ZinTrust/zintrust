import { describe, expect, it, vi } from 'vitest';

import { QueryBuilder } from '@orm/QueryBuilder';

describe('QueryBuilder (coverage)', () => {
  it('supports select aliases, aggregates, and numeric literals', () => {
    const qb = QueryBuilder.create('users');
    qb.select('1').selectAs('users.id', 'user_id').max('users.age', 'max_age');

    const sql = qb.toSQL();

    expect(sql).toContain('"users"."id"');
    expect(sql).toContain('MAX');
    expect(sql).toContain('SELECT');
    expect(sql).toContain('1');
  });

  it('supports NOT IN and numeric ORDER BY clauses', () => {
    const qb = QueryBuilder.create('users');
    qb.whereNotIn('id', [1, 2, 3]).orderBy('1');

    const sql = qb.toSQL();

    expect(sql).toContain('NOT IN');
    expect(sql).toContain('ORDER BY 1');
  });

  it('executes raw queries and throws when firstOrFail is empty', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([]),
    } as any;

    const qb = QueryBuilder.create('users', db);

    await expect(qb.firstOrFail()).rejects.toThrow(/Resource not found/i);
    await qb.raw();

    expect(db.query).toHaveBeenCalled();
  });

  it('inserts records and returns insert metadata', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ lastInsertId: 7, rowCount: 1 }),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create('users', db);
    const result = await qb.insert({ id: 7, name: 'A' });

    expect(db.execute).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 7,
        affectedRows: 1,
        insertedRecords: [{ id: 7, name: 'A' }],
      })
    );
  });

  it('updates and deletes with where conditions', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
      query: vi.fn().mockResolvedValue([]),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create('users', db);
    qb.where('id', '=', 1);

    await expect(qb.update({ name: 'New' })).resolves.toBe(1);
    await qb.delete();

    expect(db.query).toHaveBeenCalled();
  });

  it('reports insert-if-absent conflicts and conditional update affected rows', async () => {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 }),
      getType: () => 'd1',
    } as any;
    const claimBuilder = QueryBuilder.create('settlement_claims', db);
    const duplicate = await claimBuilder.insertIfAbsent(
      { provider_reference: 'ref-1', claim_token: 'token-1' },
      ['provider_reference']
    );
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.affectedRows).toBe(0);
    expect(db.execute.mock.calls[0]?.[0]).toContain(
      'ON CONFLICT ("provider_reference") DO NOTHING'
    );

    const accountBuilder = QueryBuilder.create('accounts', db).where('id', '=', 1);
    await expect(accountBuilder.increment('balance', 25)).resolves.toBe(1);
    expect(db.execute.mock.calls[1]).toEqual([
      'UPDATE "accounts" SET "balance" = "balance" + ? WHERE "id" = ?',
      [25, 1],
      false,
    ]);
  });

  it('covers insert-if-absent dialect fallbacks and invalid write inputs', async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mysql = QueryBuilder.create('claims', { execute, getType: () => 'mysql' } as any);
    await mysql.insertIfAbsent({ reference: 'ref-1' });
    expect(execute.mock.calls[0]?.[0]).toContain('INSERT IGNORE INTO');

    const sqlite = QueryBuilder.create('claims', { execute, getType: () => 'sqlite' } as any);
    await sqlite.insertIfAbsent({ reference: 'ref-2' });
    expect(execute.mock.calls[1]?.[0]).toContain('ON CONFLICT DO NOTHING');

    const sqlServer = QueryBuilder.create('claims', {
      execute,
      getType: () => 'sqlserver',
    } as any);
    await expect(sqlServer.insertIfAbsent({ reference: 'ref-3' })).rejects.toThrow(
      /not supported/i
    );
    await expect(QueryBuilder.create('', { execute } as any).insertIfAbsent({ ref: 'ref' }))
      .rejects.toThrow(/INSERT requires a table name/i);
    await expect(QueryBuilder.create('', { execute } as any).where('id', '=', 1).update({ id: 2 }))
      .rejects.toThrow(/UPDATE requires a table name/i);
    await expect(
      QueryBuilder.create('accounts', { execute } as any)
        .where('id', '=', 1)
        .increment('balance', Number.POSITIVE_INFINITY)
    ).rejects.toThrow(/finite number/i);
    await expect(
      QueryBuilder.create('accounts', { execute } as any).increment('balance', 1)
    ).rejects.toThrow(/at least one WHERE/i);
  });

  it('rejects update/delete without where clause', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([]),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create('users', db);

    await expect(qb.update({ name: 'New' })).rejects.toThrow(/UPDATE requires at least one WHERE/i);
    await expect(qb.delete()).rejects.toThrow(/DELETE requires at least one WHERE/i);
  });

  it('returns early from load() for empty models or missing relations', async () => {
    const qb = QueryBuilder.create('users');

    await qb.load([], 'profile');

    const model = {
      getAttribute: () => 1,
      setRelation: vi.fn(),
    } as any;

    await qb.load([model], 'profile');

    model.profile = () => null;
    await qb.load([model], 'profile');

    model.profile = () => ({ related: undefined, foreignKey: 'user_id', localKey: 'id' });
    await qb.load([model], 'profile');

    model.profile = () => ({
      related: { query: undefined },
      foreignKey: 'user_id',
      localKey: 'id',
    });
    await qb.load([model], 'profile');

    const noIds = {
      getAttribute: () => null,
      setRelation: vi.fn(),
      profile: () => ({
        related: { query: () => ({ whereIn: () => ({ get: async () => [] }) }) },
        foreignKey: 'user_id',
        localKey: 'id',
        type: 'hasOne',
      }),
    } as any;

    await qb.load([noIds], 'profile');

    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it('throws when insert/update/delete are called without a table name', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ lastInsertId: 1, rowCount: 1 }),
      query: vi.fn().mockResolvedValue([]),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create(db as any);

    await expect(qb.insert({ name: 'A' })).rejects.toThrow(/INSERT requires a table name/i);
    await expect(qb.update({ name: 'B' })).rejects.toThrow(/UPDATE requires a table name/i);
    await expect(qb.delete()).rejects.toThrow(/DELETE requires a table name/i);
  });
});
