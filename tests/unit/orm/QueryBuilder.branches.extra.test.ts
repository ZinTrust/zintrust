import { describe, expect, it, vi } from 'vitest';

import { QueryBuilder } from '@orm/QueryBuilder';

describe('QueryBuilder (extra branch coverage)', () => {
  it('covers BETWEEN/IN/IS operator branches and their validation errors', () => {
    const qb = QueryBuilder.create('users');

    qb.where('id', 'BETWEEN', [1, 2]);
    expect(qb.toSQL()).toContain('BETWEEN ? AND ?');
    expect(qb.getParameters()).toEqual([1, 2]);

    const qbIs = QueryBuilder.create('users');
    qbIs.where('deleted_at', 'IS', null);
    expect(qbIs.toSQL()).toContain('IS NULL');
    expect(qbIs.getParameters()).toEqual([]);

    const qbIsNot = QueryBuilder.create('users');
    qbIsNot.where('deleted_at', 'IS NOT', 'x');
    expect(qbIsNot.toSQL()).toContain('IS NOT ?');
    expect(qbIsNot.getParameters()).toEqual(['x']);

    const qbIlike = QueryBuilder.create('users');
    qbIlike.where('email', 'ILIKE', '%@example.com');
    expect(qbIlike.toSQL()).toContain('ILIKE ?');

    expect(() => QueryBuilder.create('users').where('id', 'IN', []).toSQL()).toThrow(
      /non-empty array/i
    );
    expect(() =>
      QueryBuilder.create('users')
        .where('id', 'BETWEEN', [1] as any)
        .toSQL()
    ).toThrow(/2-item array/i);
    expect(() =>
      QueryBuilder.create('users')
        .where('id', 'NOT BETWEEN', [1, 2, 3] as any)
        .toSQL()
    ).toThrow(/2-item array/i);
  });

  it('covers soft delete modes include/exclude/only and unsafe order direction', () => {
    const b = QueryBuilder.create('users', undefined as any, { softDeleteColumn: 'deleted_at' });
    expect(b.toSQL()).toContain('WHERE "deleted_at" IS NULL');

    b.withTrashed();
    expect(b.toSQL()).not.toContain('deleted_at" IS NULL');

    b.onlyTrashed();
    expect(b.toSQL()).toContain('WHERE "deleted_at" IS NOT NULL');

    expect(() => QueryBuilder.create('users').orderBy('name', 'DROP' as any)).toThrow(
      /Unsafe ORDER BY direction/i
    );
  });

  it('covers UPDATE raw values and unsafe raw expression rejection', async () => {
    const db = {
      query: vi.fn(async () => []),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create('users', db);
    qb.where('id', '=', 1);
    await qb.update({ updated_at: { __raw: 'NOW()' } as any });

    const sql = String((db.query as any).mock.calls.at(-1)?.[0] ?? '');
    const params = (db.query as any).mock.calls.at(-1)?.[1] as unknown[];
    expect(sql).toContain('"updated_at" = NOW()');
    expect(params).toEqual([1]);

    const qbBad = QueryBuilder.create('users', db);
    qbBad.where('id', '=', 1);
    await expect(qbBad.update({ updated_at: { __raw: 'NOW(1)' } as any })).rejects.toThrow(
      /Unsafe raw SQL expression/i
    );
  });

  it('covers INSERT multi-row id fallback and safe raw identifier expression', async () => {
    const db = {
      execute: vi.fn(async () => ({ lastInsertId: undefined, rowCount: 2 })),
      query: vi.fn(async () => []),
      getType: () => 'postgresql',
    } as any;

    const qb = QueryBuilder.create('users', db);
    const inserted = await qb.insert([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);

    expect(inserted.id).toBeNull();
    expect(String((db.execute as any).mock.calls[0]?.[0] ?? '')).not.toContain('RETURNING id');

    const qbUpdate = QueryBuilder.create('users', db);
    qbUpdate.where('id', '=', 1);
    await qbUpdate.update({ updated_at: { __raw: 'users.updated_at' } as any });

    const sql = String((db.query as any).mock.calls.at(-1)?.[0] ?? '');
    expect(sql).toContain('"updated_at" = users.updated_at');
  });
});
