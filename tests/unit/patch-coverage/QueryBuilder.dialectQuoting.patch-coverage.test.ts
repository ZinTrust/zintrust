import { describe, expect, it } from 'vitest';

describe('patch coverage: QueryBuilder dialect quoting', () => {
  it('executes mysql identifier escaping branch', async () => {
    const { QueryBuilder } = await import('../../../src/index');

    const fakeDb = {
      getType: () => 'mysql',
    };

    const qb = QueryBuilder.create('users', fakeDb as any);
    const sql = qb.select('id').toSQL();

    expect(sql).toContain('`users`');
  });

  it('executes sqlserver identifier escaping branch', async () => {
    const { QueryBuilder } = await import('../../../src/index');

    const fakeDb = {
      getType: () => 'sqlserver',
    };

    const qb = QueryBuilder.create('users', fakeDb as any);
    const sql = qb.select('id').toSQL();

    expect(sql).toContain('[users]');
  });
});
