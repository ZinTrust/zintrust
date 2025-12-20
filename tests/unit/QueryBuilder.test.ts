import { describe, it, expect } from 'vitest';
import { QueryBuilder } from '@orm/QueryBuilder';

describe('QueryBuilder', () => {
  it('should build a simple SELECT query', () => {
    const builder = new QueryBuilder('users');
    builder.select('id', 'name', 'email');

    const sql = builder.toSQL();
    expect(sql).toBe('SELECT id, name, email FROM users');
  });

  it('should build query with WHERE clause', () => {
    const builder = new QueryBuilder('users');
    builder.select('*').where('active', '=', true);

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE active = ?');
    expect(builder.getParameters()).toEqual([true]);
  });

  it('should build query with multiple WHERE clauses', () => {
    const builder = new QueryBuilder('users');
    builder.where('active', '=', true).where('role', '=', 'admin');

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE active = ? AND role = ?');
    expect(builder.getParameters()).toEqual([true, 'admin']);
  });

  it('should build query with LIMIT', () => {
    const builder = new QueryBuilder('users');
    builder.limit(10);

    const sql = builder.toSQL();
    expect(sql).toContain('LIMIT 10');
  });

  it('should build query with OFFSET', () => {
    const builder = new QueryBuilder('users');
    builder.limit(10).offset(20);

    const sql = builder.toSQL();
    expect(sql).toContain('LIMIT 10');
    expect(sql).toContain('OFFSET 20');
  });

  it('should build query with ORDER BY', () => {
    const builder = new QueryBuilder('users');
    builder.orderBy('name', 'DESC');

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY name DESC');
  });

  it('should support shorthand where syntax', () => {
    const builder = new QueryBuilder('users');
    builder.where('id', 123);

    expect(builder.getParameters()).toEqual([123]);
  });
});
