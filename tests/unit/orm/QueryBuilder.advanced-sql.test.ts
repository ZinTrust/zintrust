import { describe, expect, it, vi } from 'vitest';
import type { IDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';

describe('QueryBuilder advanced SQL (exists, joins, groupBy, latestPer, paginate)', () => {
  describe('whereNotNull / whereColumn', () => {
    it('compiles whereNotNull', () => {
      const sql = QueryBuilder.create('messages').whereNotNull('hidden_at').toSQL();
      expect(sql).toContain('"hidden_at" IS NOT NULL');
    });

    it('compiles whereColumn as identifier comparison without binds', () => {
      const builder = QueryBuilder.create('messages').whereColumn(
        'messages.thread_id',
        '=',
        'threads.id'
      );
      expect(builder.toSQL()).toContain('"messages"."thread_id" = "threads"."id"');
      expect(builder.getParameters()).toEqual([]);
    });

    it('rejects unsafe whereColumn operators', () => {
      expect(() =>
        QueryBuilder.create('messages').whereColumn('a.id', 'LIKE', 'b.id').toSQL()
      ).toThrow(/column comparison operator/i);
    });
  });

  describe('whereExists / whereNotExists', () => {
    it('compiles correlated whereNotExists with parameters', () => {
      const builder = QueryBuilder.create('messages')
        .where('thread_id', '=', 10)
        .whereNotExists((sub) =>
          sub
            .from('message_user_states')
            .whereColumn('message_user_states.message_id', '=', 'messages.id')
            .where('user_id', '=', 42)
            .whereNotNull('hidden_at')
        )
        .orderBy('created_at', 'DESC')
        .limit(51);

      const sql = builder.toSQL();
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "message_user_states"');
      expect(sql).toContain('"message_user_states"."message_id" = "messages"."id"');
      expect(sql).toContain('"user_id" = ?');
      expect(sql).toContain('"hidden_at" IS NOT NULL');
      expect(builder.getParameters()).toEqual([10, 42]);
    });

    it('compiles whereExists', () => {
      const sql = QueryBuilder.create('users')
        .whereExists((sub) =>
          sub.from('posts').whereColumn('posts.user_id', '=', 'users.id').where('published', '=', 1)
        )
        .toSQL();

      expect(sql).toContain('EXISTS (SELECT 1 FROM "posts"');
      expect(sql).toContain('"published" = ?');
    });

    it('requires from(table) on exists subqueries', () => {
      expect(() =>
        QueryBuilder.create('users')
          .whereExists((sub) => sub.where('id', '=', 1))
          .toSQL()
      ).toThrow(/from\(table\)/i);
    });

    it('rejects unsafe exists table names', () => {
      expect(() =>
        QueryBuilder.create('users')
          .whereNotExists((sub) => sub.from('states; drop'))
          .toSQL()
      ).toThrow(/Unsafe SQL identifier/i);
    });
  });

  describe('multi-term join ON', () => {
    it('supports string multi-term AND ON clauses', () => {
      const sql = QueryBuilder.create('message_user_states')
        .join(
          'messages',
          'messages.id = message_user_states.message_id AND message_user_states.user_id = messages.owner_id'
        )
        .toSQL();

      expect(sql).toContain(
        'INNER JOIN "messages" ON "messages"."id" = "message_user_states"."message_id" AND "message_user_states"."user_id" = "messages"."owner_id"'
      );
    });

    it('supports callback multi-term ON builders', () => {
      const builder = QueryBuilder.create('message_user_states').join('messages', (on) =>
        on
          .on('messages.id', '=', 'message_user_states.message_id')
          .on('message_user_states.thread_id', '=', 'messages.thread_id')
      );

      expect(builder.getJoins()).toEqual([
        {
          table: 'messages',
          on: 'messages.id = message_user_states.message_id AND message_user_states.thread_id = messages.thread_id',
          type: 'INNER',
        },
      ]);
      expect(builder.toSQL()).toContain(
        'ON "messages"."id" = "message_user_states"."message_id" AND "message_user_states"."thread_id" = "messages"."thread_id"'
      );
    });

    it('supports leftJoin callback ON builders', () => {
      const sql = QueryBuilder.create('users')
        .leftJoin('profiles', (on) => on.on('profiles.user_id', '=', 'users.id'))
        .toSQL();
      expect(sql).toContain('LEFT JOIN "profiles" ON "profiles"."user_id" = "users"."id"');
    });

    it('rejects empty join ON builders', () => {
      expect(() => QueryBuilder.create('users').join('profiles', () => undefined)).toThrow(
        /at least one on\(\)/i
      );
    });
  });

  describe('groupBy', () => {
    it('compiles groupBy with aggregate select', () => {
      const builder = QueryBuilder.create('messages')
        .select('thread_id')
        .select('COUNT(*) AS total')
        .whereIn('thread_id', [1, 2, 3])
        .whereNull('read_at')
        .groupBy('thread_id');

      // second select() replaces columns in this builder
      const rebuilt = QueryBuilder.create('messages')
        .select('thread_id', 'COUNT(*) AS total')
        .whereIn('thread_id', [1, 2, 3])
        .whereNull('read_at')
        .groupBy('thread_id');

      const sql = rebuilt.toSQL();
      expect(sql).toContain('SELECT "thread_id", COUNT(*) AS "total"');
      expect(sql).toContain('GROUP BY "thread_id"');
      expect(rebuilt.getParameters()).toEqual([1, 2, 3]);
      expect(builder).toBeTruthy();
    });

    it('rejects unsafe groupBy columns', () => {
      expect(() => QueryBuilder.create('messages').groupBy('id; drop').toSQL()).toThrow(
        /Unsafe SQL identifier/i
      );
    });
  });

  describe('latestPer', () => {
    it('wraps ROW_NUMBER window and filters rn = 1', () => {
      const builder = QueryBuilder.create('messages')
        .whereIn('thread_id', [7, 8])
        .whereNull('deleted_for_all_at')
        .latestPer('thread_id', {
          orderBy: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
          ],
        })
        .orderBy('created_at', 'DESC')
        .limit(20);

      const sql = builder.toSQL();
      expect(sql).toMatch(/^SELECT \* FROM \(/);
      expect(sql).toContain(
        'ROW_NUMBER() OVER (PARTITION BY "thread_id" ORDER BY "created_at" DESC, "id" DESC) AS "rn"'
      );
      expect(sql).toContain(') AS "_zt_window" WHERE "rn" = 1');
      expect(sql).toContain('ORDER BY "created_at" DESC');
      expect(sql).toContain('LIMIT 20');
      expect(builder.getParameters()).toEqual([7, 8]);
    });

    it('supports custom partition list and alias', () => {
      const sql = QueryBuilder.create('events')
        .latestPer(['tenant_id', 'user_id'], {
          orderBy: [['occurred_at', 'DESC']],
          alias: 'row_num',
        })
        .toSQL();

      expect(sql).toContain('PARTITION BY "tenant_id", "user_id"');
      expect(sql).toContain('AS "row_num"');
      expect(sql).toContain('WHERE "row_num" = 1');
    });

    it('requires orderBy', () => {
      expect(() =>
        QueryBuilder.create('messages').latestPer('thread_id', { orderBy: [] }).toSQL()
      ).toThrow(/orderBy/i);
    });
  });

  describe('join-aware paginate counts', () => {
    it('uses COUNT(DISTINCT table.id) when joins are present', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([{ total: 3 }])
          .mockResolvedValueOnce([{ id: 1 }]),
        getType: () => 'sqlite',
      } as unknown as IDatabase;

      const builder = QueryBuilder.create('users', mockDb)
        .join('profiles', 'users.id = profiles.user_id')
        .where('profiles.city', '=', 'Austin');

      await builder.paginate(1, 10);

      const countSql = String(mockDb.query.mock.calls[0]?.[0] ?? '');
      expect(countSql).toContain('COUNT(DISTINCT "users"."id") AS total');
      expect(countSql).toContain('INNER JOIN "profiles"');
      expect(countSql).toContain('"profiles"."city" = ?');
      expect(mockDb.query.mock.calls[0]?.[1]).toEqual(['Austin']);
    });

    it('allows overriding countDistinct', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([{ total: 1 }])
          .mockResolvedValueOnce([]),
        getType: () => 'sqlite',
      } as unknown as IDatabase;

      await QueryBuilder.create('users', mockDb)
        .join('profiles', 'users.id = profiles.user_id')
        .paginate(1, 5, { countDistinct: 'users.uuid' });

      const countSql = String(mockDb.query.mock.calls[0]?.[0] ?? '');
      expect(countSql).toContain('COUNT(DISTINCT "users"."uuid") AS total');
    });

    it('keeps plain COUNT(*) when there are no joins', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([{ total: 2 }])
          .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]),
        getType: () => 'sqlite',
      } as unknown as IDatabase;

      await QueryBuilder.create('users', mockDb).where('active', '=', 1).paginate(1, 10);

      const countSql = String(mockDb.query.mock.calls[0]?.[0] ?? '');
      expect(countSql).toBe('SELECT COUNT(*) AS total FROM "users" WHERE "active" = ?');
    });

    it('counts grouped queries via subquery', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([{ total: 4 }])
          .mockResolvedValueOnce([{ thread_id: 1, total: 2 }]),
        getType: () => 'sqlite',
      } as unknown as IDatabase;

      await QueryBuilder.create('messages', mockDb)
        .select('thread_id', 'COUNT(*) AS total')
        .groupBy('thread_id')
        .paginate(1, 10);

      const countSql = String(mockDb.query.mock.calls[0]?.[0] ?? '');
      expect(countSql).toContain('SELECT COUNT(*) AS total FROM (');
      expect(countSql).toContain('GROUP BY "thread_id"');
      expect(countSql).toContain(') AS "_zt_count"');
    });
  });

  describe('regressions', () => {
    it('preserves whereGroup and whereNormalized', () => {
      const builder = QueryBuilder.create('users')
        .where('tenant_id', '=', 1)
        .whereGroup((group) => group.where('role', '=', 'admin').orWhere('role', '=', 'owner'))
        .whereNormalized('email', '  Ada@Example.COM  ');

      const sql = builder.toSQL();
      expect(sql).toContain('("role" = ? OR "role" = ?)');
      expect(sql).toContain('LOWER(TRIM("email")) = ?');
      expect(builder.getParameters()).toEqual([1, 'admin', 'owner', 'ada@example.com']);
    });

    it('preserves single-term string joins', () => {
      const sql = QueryBuilder.create('users')
        .join('posts', 'users.id = posts.user_id')
        .toSQL();
      expect(sql).toContain('INNER JOIN "posts" ON "users"."id" = "posts"."user_id"');
    });
  });
});
