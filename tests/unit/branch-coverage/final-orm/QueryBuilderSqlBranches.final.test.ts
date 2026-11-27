/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

import { QueryBuilder } from '@orm/QueryBuilder';

const db = (queryResult: unknown[] = [], dialect = 'postgresql') =>
  ({
    query: vi.fn(async () => queryResult),
    execute: vi.fn(async () => ({ rowCount: 1, lastInsertId: 1 })),
    getType: () => dialect,
  }) as any;

describe('QueryBuilder SQL uncovered branches (final-orm)', () => {
  it('compiles IS NULL predicates through the null clause path', () => {
    const sql = QueryBuilder.create('users').whereNull('deleted_at').toSQL();
    expect(sql).toContain('"deleted_at" IS NULL');
  });

  it('falls through to a parameterized comparison for null with an unusual operator', () => {
    const qb = QueryBuilder.create('users').where('name', 'LIKE', null);
    expect(qb.toSQL()).toContain('"name" LIKE ?');
    expect(qb.getParameters()).toEqual([null]);
  });

  it('compiles EXISTS clauses with no inner conditions', () => {
    const sql = QueryBuilder.create('users')
      .whereExists((sub) => {
        sub.from('orders');
      })
      .toSQL();
    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('EXISTS (SELECT 1 FROM "orders")');
    expect(sql).not.toContain('EXISTS (SELECT 1 FROM "orders" WHERE');
  });

  it('skips empty where groups when compiling fragments', () => {
    const sql = QueryBuilder.create('users').whereGroup(() => undefined).toSQL();
    expect(sql).toBe('SELECT * FROM "users"');
  });

  it('builds count queries without a FROM clause when the table name is empty', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([]),
      getType: () => 'postgresql',
    } as any;
    const result = await QueryBuilder.create('', database).paginate(1, 10);
    expect(result.total).toBe(3);
    expect(database.query.mock.calls[0]?.[0]).not.toContain(' FROM ');
  });

  it('returns the first row from firstOrFail', async () => {
    const row = { id: 1, name: 'found' };
    const qb = QueryBuilder.create('users', db([row]));
    await expect(qb.firstOrFail()).resolves.toEqual(row);
  });

  it('rejects an insert array whose first item is missing', async () => {
    const qb = QueryBuilder.create('users', db());
    await expect(qb.insert([undefined as any])).rejects.toThrow(/at least one column/i);
  });

  it('treats a paginate count row without total as zero', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([]),
      getType: () => 'postgresql',
    } as any;

    const result = await QueryBuilder.create('users', database).paginate(1, 10);
    expect(result.total).toBe(0);
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  it('defaults the dialect when the database has no getType method', async () => {
    const model = (attrs: Record<string, unknown>) => ({
      getAttribute: (key: string) => attrs[key],
      setAttribute: vi.fn(),
      setRelation: vi.fn(),
      hasMany: () => ({
        type: 'hasMany',
        foreignKey: 'parent_id',
        localKey: 'id',
        related: { query: () => QueryBuilder.create('children') },
      }),
    });
    const parent = model({ id: 1 });

    const database = { query: vi.fn(async () => []) } as any;
    const qb = QueryBuilder.create('parents', database);
    await expect(qb.loadCount([parent as any], 'hasMany')).resolves.toBeUndefined();
  });
});
