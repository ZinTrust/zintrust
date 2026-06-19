import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it } from 'vitest';

describe('QueryBuilder Extended Basic', () => {
  it('should support OR conditions', () => {
    const builder = QueryBuilder.create('users');
    builder.where('role', 'admin').orWhere('role', 'moderator');

    const conditions = builder.getWhereClauses();
    expect(conditions).toHaveLength(2);
  });

  it('should support IN operator', () => {
    const builder = QueryBuilder.create('users');
    builder.where('role', 'IN', ['admin', 'user', 'guest']);

    const conditions = builder.getWhereClauses();
    expect(conditions[0].operator).toBe('IN');
    expect(conditions[0].value).toEqual(['admin', 'user', 'guest']);
  });

  it('should support LIKE operator', () => {
    const builder = QueryBuilder.create('users');
    builder.where('name', 'LIKE', '%john%');

    const sql = builder.toSQL();
    expect(sql).toContain('LIKE ?');
  });

  it('should support BETWEEN operator', () => {
    const builder = QueryBuilder.create('users');
    builder.where('age', 'BETWEEN', [18, 65]);

    const conditions = builder.getWhereClauses();
    expect(conditions[0].operator).toBe('BETWEEN');
  });
});

describe('QueryBuilder Extended Advanced', () => {
  it('should build complex query', () => {
    const builder = QueryBuilder.create('posts');
    builder
      .select('id', 'title', 'user_id')
      .where('published', true)
      .where('user_id', 5)
      .orderBy('created_at', 'DESC')
      .limit(20)
      .offset(10);

    const sql = builder.toSQL();
    expect(sql).toContain('SELECT "id", "title", "user_id" FROM "posts"');
    expect(sql).toContain('WHERE "published" = ? AND "user_id" = ?');
    expect(sql).toContain('ORDER BY "created_at" DESC');
    expect(sql).toContain('LIMIT 20');
    expect(sql).toContain('OFFSET 10');
  });

  it('should get all builder properties', () => {
    const builder = QueryBuilder.create('users');
    builder
      .select('name', 'email')
      .where('active', true)
      .orderBy('name', 'ASC')
      .limit(5)
      .offset(10)
      .join('profiles', 'users.id = profiles.user_id');

    expect(builder.getSelectColumns()).toEqual(['name', 'email']);
    expect(builder.getWhereClauses()).toHaveLength(1);
    expect(builder.getLimit()).toBe(5);
    expect(builder.getOffset()).toBe(10);
    expect(builder.getOrderBy()).toEqual({ column: 'name', direction: 'ASC' });
    expect(builder.getJoins()).toHaveLength(1);
  });

  it('renders an INNER JOIN clause in the compiled SQL', () => {
    const sql = QueryBuilder.create('account_keys')
      .select('account_keys.wrapped_private_key', 'users.daily_limit')
      .where('user_id', '=', 'u1')
      .join('users', 'account_keys.user_id = users.id')
      .toSQL();

    expect(sql).toContain('INNER JOIN "users" ON "account_keys"."user_id" = "users"."id"');
    expect(sql.indexOf('JOIN')).toBeLessThan(sql.indexOf('WHERE'));
  });

  it('renders a LEFT JOIN clause distinct from inner joins', () => {
    const sql = QueryBuilder.create('users')
      .leftJoin('profiles', 'users.id = profiles.user_id')
      .toSQL();

    expect(sql).toContain('LEFT JOIN "profiles" ON "users"."id" = "profiles"."user_id"');
  });

  it('rejects an unsafe join condition', () => {
    expect(() =>
      QueryBuilder.create('users').join('profiles', 'users.id = profiles.user_id; DROP TABLE users').toSQL()
    ).toThrow();
  });
});
