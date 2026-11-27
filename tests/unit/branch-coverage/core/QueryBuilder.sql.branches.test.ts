/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it } from 'vitest';

const db = (type?: string) =>
  ({
    query: async () => [],
    execute: async () => ({ rowCount: 1, rows: [] }),
    getType: () => type,
  }) as any;

describe('QueryBuilder SQL branch coverage', () => {
  it('rejects empty and unsafe identifiers', () => {
    expect(() => QueryBuilder.create('users').from('   ')).toThrow(
      /Empty SQL identifier for table name/i
    );
    expect(() => QueryBuilder.create('users').select('   ').toSQL()).toThrow(
      /Empty SQL identifier for select column/i
    );
    expect(() => QueryBuilder.create('users').selectAs('id', '   ')).toThrow(
      /Empty SQL identifier for select alias/i
    );
    expect(() => QueryBuilder.create('users').selectAs('id', 'bad alias')).toThrow(
      /Unsafe SQL identifier for select alias/i
    );
    expect(() => QueryBuilder.create('users').orderBy('name', 'DROP' as any)).toThrow(
      /Unsafe ORDER BY direction/i
    );
    expect(() => QueryBuilder.create('users').select('col AS bad alias').toSQL()).toThrow(
      /Unsafe SQL identifier/i
    );
  });

  it('rejects empty raw SQL expressions in updates', async () => {
    const qb = QueryBuilder.create('users', db('postgresql')).where('id', '=', 1);
    await expect(qb.update({ name: { __raw: '   ' } as any })).rejects.toThrow(
      /Empty raw SQL expression/i
    );
  });

  it('normalizes explicit null, empty and nullish order directions', () => {
    expect(QueryBuilder.create('users').orderBy('name').toSQL()).toContain('ORDER BY "name" ASC');
    expect(QueryBuilder.create('users').orderBy('name', null as any).toSQL()).toContain(
      'ORDER BY "name" ASC'
    );
    expect(QueryBuilder.create('users').orderBy('name', '   ' as any).toSQL()).toContain(
      'ORDER BY "name" ASC'
    );
  });

  it('covers normalized-text options on both values and columns', () => {
    const plain = QueryBuilder.create('users')
      .whereNormalized('name', '  MiXeD  ', { trim: false, lowercase: false })
      .toSQL();
    expect(plain).toContain('"name" = ?');
    expect(plain).not.toContain('TRIM');
    expect(plain).not.toContain('LOWER');

    const withNull = QueryBuilder.create('users').whereNormalized('name', null).toSQL();
    expect(withNull).toContain('LOWER(TRIM("name")) IS NULL');
    expect(QueryBuilder.create('users').whereNormalized('name', ' X ').getParameters()).toEqual(['x']);
  });

  it('covers MATCH dialect validation and operator branches', () => {
    expect(() => QueryBuilder.create('users').where('body', 'MATCH', 'term').toSQL()).not.toThrow();
    expect(() =>
      QueryBuilder.create('users', db('postgresql')).where('body', 'MATCH', 'term').toSQL()
    ).toThrow(/MATCH is only supported/i);
    expect(() =>
      QueryBuilder.create('users', db('sqlite')).where('body', 'MATCH', 42).toSQL()
    ).toThrow(/MATCH operator requires a string value/i);
  });

  it('validates limit and offset values', () => {
    expect(() => QueryBuilder.create('users').limit(-1)).toThrow(/Unsafe LIMIT value/i);
    expect(() => QueryBuilder.create('users').limit(1.5)).toThrow(/Unsafe LIMIT value/i);
    expect(() => QueryBuilder.create('users').offset(Number.POSITIVE_INFINITY)).toThrow(
      /Unsafe OFFSET value/i
    );
  });

  it('formats aggregates with and without aliases', () => {
    expect(QueryBuilder.create('sales').select('MAX(*)').toSQL()).toContain('MAX(*)');
    expect(QueryBuilder.create('sales').select('SUM(price) AS total').toSQL()).toContain(
      'SUM("price") AS "total"'
    );
    expect(QueryBuilder.create('sales').select(1 as any).getParameters()).toEqual([]);
  });

  it('covers null-comparison operator variants', () => {
    expect(QueryBuilder.create('users').where('a', '=', null).toSQL()).toContain('"a" IS NULL');
    expect(QueryBuilder.create('users').where('b', '==', null).toSQL()).toContain('"b" IS NULL');
    expect(QueryBuilder.create('users').where('c', '!=', null).toSQL()).toContain(
      '"c" IS NOT NULL'
    );
    expect(QueryBuilder.create('users').where('d', '<>', null).toSQL()).toContain(
      '"d" IS NOT NULL'
    );
    expect(QueryBuilder.create('users').where('e', 'NOT', null).toSQL()).toContain(
      '"e" IS NOT NULL'
    );
    expect(QueryBuilder.create('users').whereNull('f').toSQL()).toContain('"f" IS NULL');
    expect(QueryBuilder.create('users').whereNotNull('g').toSQL()).toContain('"g" IS NOT NULL');
  });

  it('covers empty groups, EXISTS subqueries and flattened predicates', () => {
    const emptyGroup = QueryBuilder.create('users').whereGroup(() => {});
    expect(emptyGroup.toSQL()).not.toContain('WHERE');
    expect(emptyGroup.getWhereClauses()).toEqual([]);

    const withPredicates = QueryBuilder.create('users')
      .whereGroup((b) => b.where('a', '=', 1))
      .whereExists((b) => b.from('orders').where('orders.user_id', '=', 1))
      .whereColumn('users.id', '=', 'orders.user_id');

    expect(withPredicates.toSQL()).toContain('EXISTS');
    expect(withPredicates.getWhereClauses()).toHaveLength(1);
    expect(withPredicates.toSQL()).toContain('"users"."id" = "orders"."user_id"');
  });

  it('validates join ON inputs and compiles dialect-specific joins', () => {
    expect(() => QueryBuilder.create('users').join('orders', '   ')).toThrow(
      /Unsafe SQL join condition/i
    );
    expect(() => QueryBuilder.create('users').join('orders', 'users.id = orders.id')).not.toThrow();
    expect(
      QueryBuilder.create('users', db('mysql'))
        .leftJoin('orders', (on) => on.on('users.id', '=', 'orders.user_id'))
        .toSQL()
    ).toContain('LEFT JOIN `orders`');
  });

  it('validates latestPer inputs and compiles window queries', () => {
    expect(() => QueryBuilder.create('users').latestPer(['', ' '], { orderBy: [['id', 'ASC']] })).toThrow(
      /latestPer requires at least one partition column/i
    );
    expect(() => QueryBuilder.create('users').latestPer('tenant_id', { orderBy: [] })).toThrow(
      /latestPer requires at least one orderBy column/i
    );

    const star = QueryBuilder.create('events').latestPer('tenant_id', {
      orderBy: [['created_at', 'DESC']],
    });
    expect(star.toSQL()).toContain('*, ROW_NUMBER()');
    expect(star.toSQL()).toContain('ORDER BY "created_at" DESC');

    const columns = QueryBuilder.create('events')
      .select('id', 'created_at')
      .latestPer('tenant_id', { orderBy: [['created_at', 'DESC']], alias: 'rank' });
    expect(columns.toSQL()).toContain('"id", "created_at", ROW_NUMBER()');
    expect(columns.toSQL()).toContain('AS "rank"');
  });

  it('builds queries with an empty table name', () => {
    const sql = QueryBuilder.create('', db()).toSQL();
    expect(sql).not.toContain('FROM');
    expect(QueryBuilder.create('', db()).select('1').toSQL()).toContain('SELECT 1');
  });

  it('covers soft-delete toggles when no soft delete is configured', () => {
    expect(QueryBuilder.create('users').withTrashed().toSQL()).not.toContain('deleted_at');
    expect(QueryBuilder.create('users').onlyTrashed().toSQL()).toContain(
      '"deleted_at" IS NOT NULL'
    );
    expect(QueryBuilder.create('users').withoutTrashed().toSQL()).toContain(
      '"deleted_at" IS NULL'
    );
  });

  it('resets select columns with an empty select call and rejects unsafe operators', () => {
    const qb = QueryBuilder.create('users').select('id');
    expect(qb.select().getSelectColumns()).toEqual(['*']);
    expect(() => QueryBuilder.create('users').where('id', 5 as any, 'extra')).toThrow(
      /Unsafe SQL operator/i
    );
  });

  it('covers count query branches for group-by and join cases', async () => {
    const countDb = {
      query: async () => [{ total: 3, count: 3 }],
      getType: () => 'postgresql',
    } as any;

    const grouped = QueryBuilder.create('users', countDb).groupBy('tenant_id').orderBy('id');
    expect(grouped.toSQL()).toContain('GROUP BY');
    expect(await grouped.count()).toBe(3);

    const joined = QueryBuilder.create('users', countDb).join(
      'orders',
      'users.id = orders.user_id'
    );
    await expect(joined.paginate(1, 5)).resolves.toBeDefined();

    const distinct = QueryBuilder.create('users', countDb).join(
      'orders',
      'users.id = orders.user_id'
    );
    await expect(
      distinct.paginate(1, 5, { countDistinct: 'users.id' })
    ).resolves.toBeDefined();
  });
});
