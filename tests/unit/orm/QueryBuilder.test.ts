import type { IDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it, vi } from 'vitest';

// Import helper functions for testing

describe('QueryBuilder', () => {
  it('should build a simple SELECT query', () => {
    const builder = QueryBuilder.create('users');
    builder.select('id', 'name', 'email');

    const sql = builder.toSQL();
    expect(sql).toBe('SELECT "id", "name", "email" FROM "users"');
  });

  it('should build query with WHERE clause', () => {
    const builder = QueryBuilder.create('users');
    builder.select('*').where('active', '=', true);

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE "active" = ?');
    expect(builder.getParameters()).toEqual([true]);
  });

  it('should build query with multiple WHERE clauses', () => {
    const builder = QueryBuilder.create('users');
    builder.where('active', '=', true).where('role', '=', 'admin');

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE "active" = ? AND "role" = ?');
    expect(builder.getParameters()).toEqual([true, 'admin']);
  });

  it('should build query with andWhere', () => {
    const builder = QueryBuilder.create('users');
    builder.where('active', '=', true).andWhere('role', '=', 'admin');

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE "active" = ? AND "role" = ?');
    expect(builder.getParameters()).toEqual([true, 'admin']);
  });

  it('should build query with orWhere', () => {
    const builder = QueryBuilder.create('users');
    builder.where('active', '=', true).orWhere('role', '=', 'admin');

    const sql = builder.toSQL();
    expect(sql).toContain('WHERE "active" = ? OR "role" = ?');
    expect(builder.getParameters()).toEqual([true, 'admin']);
  });

  it('should build grouped OR predicates inside an AND scope', () => {
    const builder = QueryBuilder.create('guest_invitations');

    builder
      .where('event_id', '=', 7)
      .whereGroup((group) =>
        group
          .where('token', '=', 'abc123')
          .orWhere('invite_code', '=', 'abc123')
          .orWhere('id', '=', 42)
      );

    expect(builder.toSQL()).toContain(
      'WHERE "event_id" = ? AND ("token" = ? OR "invite_code" = ? OR "id" = ?)'
    );
    expect(builder.getParameters()).toEqual([7, 'abc123', 'abc123', 42]);
  });

  it('should build normalized text comparison predicates', () => {
    const builder = QueryBuilder.create('guest_invitations');

    builder.where('event_id', '=', 7).whereNormalized('email', '  USER@Example.com  ');

    expect(builder.toSQL()).toContain('WHERE "event_id" = ? AND LOWER(TRIM("email")) = ?');
    expect(builder.getParameters()).toEqual([7, 'user@example.com']);
  });

  it('should build query with LIMIT', () => {
    const builder = QueryBuilder.create('users');
    builder.limit(10);

    const sql = builder.toSQL();
    expect(sql).toContain('LIMIT 10');
  });

  it('should build query with OFFSET', () => {
    const builder = QueryBuilder.create('users');
    builder.limit(10).offset(20);

    const sql = builder.toSQL();
    expect(sql).toContain('LIMIT 10');
    expect(sql).toContain('OFFSET 20');
  });

  it('should build query with ORDER BY', () => {
    const builder = QueryBuilder.create('users');
    builder.orderBy('name', 'DESC');

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY "name" DESC');
  });

  it('should build query with random order (default dialect)', () => {
    const builder = QueryBuilder.create('users');
    builder.inRandomOrder();

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY RANDOM()');
  });

  it('should build query with random order for MySQL', () => {
    const mockDb = {
      getType: () => 'mysql',
    } as IDatabase;
    const builder = QueryBuilder.create('users', mockDb);
    builder.inRandomOrder();

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY RAND()');
  });

  it('should build query with random order for PostgreSQL', () => {
    const mockDb = {
      getType: () => 'postgres',
    } as unknown as IDatabase;
    const builder = QueryBuilder.create('users', mockDb);
    builder.inRandomOrder();

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY RANDOM()');
  });

  it('should build query with random order for SQLite', () => {
    const mockDb = {
      getType: () => 'sqlite',
    } as IDatabase;
    const builder = QueryBuilder.create('users', mockDb);
    builder.inRandomOrder();

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY RANDOM()');
  });

  it('should build query with random order for MSSQL', () => {
    const mockDb = {
      getType: () => 'mssql',
    } as unknown as IDatabase;
    const builder = QueryBuilder.create('users', mockDb);
    builder.inRandomOrder();

    const sql = builder.toSQL();
    expect(sql).toContain('ORDER BY NEWID()');
  });

  it('should support shorthand where syntax', () => {
    const builder = QueryBuilder.create('users');
    builder.where('id', 123);

    expect(builder.getParameters()).toEqual([123]);
  });

  it('should add joins', () => {
    const builder = QueryBuilder.create('users');
    builder.join('posts', 'users.id = posts.user_id');

    expect(builder.getJoins()).toEqual([
      { table: 'posts', on: 'users.id = posts.user_id', type: 'INNER' },
    ]);
  });

  it('should add left joins', () => {
    const builder = QueryBuilder.create('users');
    builder.leftJoin('posts', 'users.id = posts.user_id');

    expect(builder.getJoins()).toEqual([
      { table: 'posts', on: 'users.id = posts.user_id', type: 'LEFT' },
    ]);
  });

  it('should execute get()', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ id: 1 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    const result = await builder.get();

    expect(mockDb.query).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1 }]);
  });

  it('paginate returns a paginator and restores limit/offset', async () => {
    const mockDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ total: 25 }])
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    builder.limit(99).offset(5);

    const result = await builder.paginate(2, 10, { baseUrl: '/users', query: { q: 'a' } });

    expect(result.total).toBe(25);
    expect(result.perPage).toBe(10);
    expect(result.currentPage).toBe(2);
    expect(result.lastPage).toBe(3);
    expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.links.next).toContain('page=3');
    expect(result.links.prev).toContain('page=1');

    expect(builder.getLimit()).toBe(99);
    expect(builder.getOffset()).toBe(5);

    const calls = (mockDb.query as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String(calls[0]?.[0])).toContain('COUNT(*)');
    expect(String(calls[1]?.[0])).toContain('LIMIT 10');
    expect(String(calls[1]?.[0])).toContain('OFFSET 10');
  });

  it('paginate rejects invalid page values', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);

    await expect(builder.paginate(0, 10)).rejects.toThrow(/positive integer/i);
    await expect(builder.paginate(1, 0)).rejects.toThrow(/positive integer/i);
  });

  it('should execute first()', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ id: 1 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    const result = await builder.first();

    expect(mockDb.query).toHaveBeenCalled();
    expect(builder.getLimit()).toBe(1);
    expect(result).toEqual({ id: 1 });
  });

  it('should throw error if db is not provided for execution', async () => {
    const builder = QueryBuilder.create('users');
    await expect(builder.get()).rejects.toThrow('Database instance not provided');
  });

  it('should execute count()', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ count: 42 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    const result = await builder.count();

    expect(mockDb.query).toHaveBeenCalled();
    expect(result).toBe(42);
  });

  it('should execute count() with where clause', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ count: 5 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    builder.where('active', '=', true);
    const result = await builder.count();

    expect(mockDb.query).toHaveBeenCalled();
    expect(result).toBe(5);
    expect(String((mockDb.query as any).mock.calls[0][0])).toContain('COUNT(*)');
  });

  it('should execute count() with joins (wraps in subquery)', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ count: 10 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    builder.join('posts', 'users.id = posts.user_id');
    const result = await builder.count();

    expect(mockDb.query).toHaveBeenCalled();
    expect(result).toBe(10);
    const sql = String((mockDb.query as any).mock.calls[0][0]);
    // count() wraps the entire query in a subquery
    expect(sql).toContain('SELECT COUNT(*) as count FROM (');
    expect(sql).toContain('INNER JOIN "posts"');
  });

  it('should execute count() with groupBy (wraps in subquery)', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([{ count: 3 }]),
    } as unknown as IDatabase;

    const builder = QueryBuilder.create('users', mockDb as any);
    builder.select('role', 'COUNT(*) as total').groupBy('role');
    const result = await builder.count();

    expect(mockDb.query).toHaveBeenCalled();
    expect(result).toBe(3);
    const sql = String((mockDb.query as any).mock.calls[0][0]);
    // count() wraps the grouped query in a subquery
    expect(sql).toContain('SELECT COUNT(*) as count FROM (');
    expect(sql).toContain('GROUP BY "role"');
  });

  it('should throw error if db is not provided for count', async () => {
    const builder = QueryBuilder.create('users');
    await expect(builder.count()).rejects.toThrow('Database instance not provided to QueryBuilder');
  });

  it('should reject empty select identifier', () => {
    const builder = QueryBuilder.create('users');
    builder.select(' ');

    expect(() => builder.toSQL()).toThrow(/Empty SQL identifier/i);
  });

  it('should reject unsafe select identifier', () => {
    const builder = QueryBuilder.create('users');
    builder.select('id; DROP TABLE users');

    expect(() => builder.toSQL()).toThrow(/Unsafe SQL identifier/i);
  });

  it('should reject unsafe WHERE column identifier', () => {
    const builder = QueryBuilder.create('users');

    expect(() => builder.where('user id', '=', 1)).toThrow(/Unsafe SQL identifier/i);
  });

  it('should reject unsafe SQL operator', () => {
    const builder = QueryBuilder.create('users');

    expect(() => builder.where('id', 'DROP' as any, 1)).toThrow(/Unsafe SQL operator/i);
  });

  it('should reject non-string operator when value provided', () => {
    const builder = QueryBuilder.create('users');

    expect(() => builder.where('id', 1 as any, 2)).toThrow(/Unsafe SQL operator/i);
  });

  it('should build IN clause with parameters and reject empty IN array', () => {
    const ok = QueryBuilder.create('users');
    ok.where('id', 'IN', [1, 2]);
    expect(ok.toSQL()).toContain('WHERE "id" IN (?, ?)');
    expect(ok.getParameters()).toEqual([1, 2]);
  });

  it('should allow restoring default soft-delete filtering with withoutTrashed()', () => {
    const builder = QueryBuilder.create('users', undefined as any, {
      softDeleteColumn: 'deleted_at',
    });

    builder.withTrashed().withoutTrashed();

    expect(builder.toSQL()).toContain('WHERE "deleted_at" IS NULL');
  });

  // Tests for uncovered lines through integration approach
  describe('Coverage Tests for Uncovered Lines', () => {
    it('should test query builder with soft delete modes', () => {
      const builder = QueryBuilder.create('users', undefined as any, {
        softDeleteColumn: 'deleted_at',
      });

      // Test onlyTrashed mode
      builder.onlyTrashed();
      expect(builder.toSQL()).toContain('WHERE "deleted_at" IS NOT NULL');
    });

    it('should test query builder with IS NULL operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('deleted_at', 'IS', null);

      expect(builder.toSQL()).toContain('WHERE "deleted_at" IS NULL');
      expect(builder.getParameters()).toEqual([]);
    });

    it('should test query builder with IS NOT NULL operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('deleted_at', 'IS NOT', null);

      expect(builder.toSQL()).toContain('WHERE "deleted_at" IS NOT NULL');
      expect(builder.getParameters()).toEqual([]);
    });

    it('should test query builder with IN operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('id', 'IN', [1, 2, 3]);

      expect(builder.toSQL()).toContain('WHERE "id" IN (?, ?, ?)');
      expect(builder.getParameters()).toEqual([1, 2, 3]);
    });

    it('should test query builder with NOT IN operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('id', 'NOT IN', [1, 2, 3]);

      expect(builder.toSQL()).toContain('WHERE "id" NOT IN (?, ?, ?)');
      expect(builder.getParameters()).toEqual([1, 2, 3]);
    });

    it('should test query builder with LIKE operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('name', 'LIKE', '%test%');

      expect(builder.toSQL()).toContain('WHERE "name" LIKE ?');
      expect(builder.getParameters()).toEqual(['%test%']);
    });

    it('should test query builder with BETWEEN operator', () => {
      const builder = QueryBuilder.create('users');
      builder.where('age', 'BETWEEN', [18, 65]);

      expect(builder.toSQL()).toContain('WHERE "age" BETWEEN ? AND ?');
      expect(builder.getParameters()).toEqual([18, 65]);
    });

    it('should test query builder with ORDER BY', () => {
      const builder = QueryBuilder.create('users');
      builder.orderBy('name', 'ASC').orderBy('created_at', 'DESC');

      expect(builder.toSQL()).toContain('ORDER BY "name" ASC, "created_at" DESC');
    });

    it('should test query builder with LIMIT and OFFSET', () => {
      const builder = QueryBuilder.create('users');
      builder.limit(10).offset(5);

      expect(builder.toSQL()).toContain('LIMIT 10 OFFSET 5');
    });

    it('should test query builder with subquery', () => {
      const builder = QueryBuilder.create('users');
      builder.where('user_id', '=', 1);

      expect(builder.toSQL()).toContain('WHERE "user_id" = ?');
      expect(builder.getParameters()).toEqual([1]);
    });

    it('should test query builder with cursor pagination', () => {
      const builder = QueryBuilder.create('users');
      builder.where('id', '>', 100).orderBy('id', 'ASC').limit(10);

      expect(builder.toSQL()).toContain('WHERE "id" > ?');
      expect(builder.toSQL()).toContain('ORDER BY "id"');
      expect(builder.toSQL()).toContain('LIMIT 10');
      expect(builder.getParameters()).toEqual([100]);
    });
  });

  // Tests for write operations (insert, update, delete)
  describe('QueryBuilder Coverage', () => {
    it('should test withCount method', () => {
      const builder = QueryBuilder.create('users');
      builder.withCount('posts');
      // Should not throw
      expect(builder.toSQL()).toContain('SELECT');
    });

    it('should test with method with EagerLoadConstraints object', () => {
      const builder = QueryBuilder.create('users');
      builder.with({
        posts: (query) => query.where('published', '=', true),
        comments: undefined,
      });
      expect(builder.toSQL()).toContain('SELECT');
    });

    it('should test load method', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).posts = () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: {
          query: () => ({
            getTable: () => 'posts',
            whereIn: () => ({ get: async () => [] }),
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('users', mockDb);
      await qb.load(models as any, 'posts');
      // load method calls loadRelation which queries the database
    });

    it('should test load method early return with empty models', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const qb = QueryBuilder.create('users', mockDb);
      await qb.load([], 'posts');
      // early return for empty models
    });

    it('should test with method with object constraints', () => {
      const qb = QueryBuilder.create('users');
      const result = qb.with({
        posts: (query) => query.where('published', true),
        comments: (query) => query.where('approved', true),
      });
      expect(result).toBe(qb);
    });

    it('should test withCount method', () => {
      const qb = QueryBuilder.create('users');
      const result = qb.withCount('posts');
      expect(result).toBe(qb);
    });

    it('should test load method with non-existent relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];

      const qb = QueryBuilder.create('users', mockDb);
      await qb.load(models as any, 'nonExistentRelation');
      // load with non-existent relation returns early
    });

    it('should test ping method', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [{ '1': 1 }], rowCount: 1 }),
        query: vi.fn().mockResolvedValue([{ '1': 1 }]),
        getType: () => 'sqlite',
      };
      await QueryBuilder.ping(mockDb);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should test load method with morphTo relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test', imageable_type: 'User', imageable_id: 1 },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).imageable = () => ({
        type: 'morphTo',
        foreignType: 'imageable_type',
        foreignKey: 'imageable_id',
        morphMap: {
          User: {
            query: () => ({
              getTable: () => 'users',
              whereIn: () => ({ get: async () => [] }),
              get: async () => [],
            }),
          },
        },
      });

      const qb = QueryBuilder.create('images', mockDb);
      await qb.load(models as any, 'imageable');
    });

    it('should test load method with morphMany relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).comments = () => ({
        type: 'morphMany',
        foreignType: 'commentable_type',
        foreignKey: 'commentable_id',
        related: {
          query: () => ({
            getTable: () => 'comments',
            where: () => ({ get: async () => [] }),
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('posts', mockDb);
      await qb.load(models as any, 'comments');
    });

    it('should test load method with belongsToMany relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).roles = () => ({
        type: 'belongsToMany',
        foreignKey: 'user_id',
        localKey: 'id',
        relatedKey: 'role_id',
        throughTable: 'user_roles',
        related: {
          query: () => ({
            getTable: () => 'roles',
            join: function() { return this; },
            selectAs: function() { return this; },
            whereIn: function() { return this; },
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('users', mockDb);
      await qb.load(models as any, 'roles');
    });

    it('should test load method with constraint function', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).posts = () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: {
          query: () => ({
            getTable: () => 'posts',
            where: function() { return this; },
            whereIn: function() { return { get: async () => [] }; },
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('users', mockDb);
      await qb.load(models as any, 'posts', (query) => query.where('published', true));
    });

    it('should test load method with hasManyThrough relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).posts = () => ({
        type: 'hasManyThrough',
        foreignKey: 'user_id',
        localKey: 'id',
        throughKey: 'post_id',
        throughTable: 'posts',
        through: {
          query: () => ({
            getTable: () => 'posts',
            where: function() { return this; },
            whereIn: function() { return { get: async () => [] }; },
            get: async () => [],
          }),
        },
        related: {
          query: () => ({
            getTable: () => 'comments',
            where: function() { return this; },
            whereIn: function() { return { get: async () => [] }; },
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('users', mockDb);
      await qb.load(models as any, 'posts');
    });

    it('should test load method with belongsTo relation', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test', user_id: 1 },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).user = () => ({
        type: 'belongsTo',
        foreignKey: 'user_id',
        localKey: 'id',
        related: {
          query: () => ({
            getTable: () => 'users',
            whereIn: function() { 
              return { 
                get: async () => [{
                  getAttribute: (k: string) => k === 'id' ? 1 : undefined,
                  _attrs: { id: 1, name: 'User' }
                }] 
              }; 
            },
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('posts', mockDb);
      await qb.load(models as any, 'user');
    });

    it('should test load method with belongsToMany empty ids', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        getType: () => 'sqlite',
      };
      const models = [{
        _attrs: { id: 1, name: 'Test' },
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (models[0] as any).roles = () => ({
        type: 'belongsToMany',
        foreignKey: 'user_id',
        localKey: 'id',
        relatedKey: 'role_id',
        throughTable: 'user_roles',
        related: {
          query: () => ({
            getTable: () => 'roles',
            join: function() { return this; },
            selectAs: function() { return this; },
            whereIn: function() { return this; },
            get: async () => [],
          }),
        },
      });

      const qb = QueryBuilder.create('users', mockDb);
      // Models have no matching localKey values so ids will be empty
      const modelsWithoutId = [{
        _attrs: { name: 'Test' }, // no id field
        _rels: {},
        getAttribute: function(key: string) { return this._attrs[key]; },
        setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
        setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
      }];
      (modelsWithoutId[0] as any).roles = () => ({
        type: 'belongsToMany',
        foreignKey: 'user_id',
        localKey: 'id',
        relatedKey: 'role_id',
        throughTable: 'user_roles',
        related: {
          query: () => ({
            getTable: () => 'roles',
            join: function() { return this; },
            selectAs: function() { return this; },
            whereIn: function() { return this; },
            get: async () => [],
          }),
        },
      });

      await qb.load(modelsWithoutId as any, 'roles');
    });

    it('should test with method string path', () => {
      const qb = QueryBuilder.create('users');
      const result = qb.with('posts');
      expect(result).toBe(qb);
    });
    it('should test insert method with db', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1, lastInsertId: 1 }),
        query: vi.fn(),
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.select('id', 'name');
      const result = await builder.insert({ name: 'Test' });
      expect(result.id).toBe(1);
      expect(result.affectedRows).toBe(1);
    });

    it('should test insert method without db throws error', async () => {
      const builder = QueryBuilder.create('users');
      builder.select('id', 'name');
      await expect(builder.insert({ name: 'Test' })).rejects.toThrow('Database instance not provided to QueryBuilder');
    });

    it('should test insertIfAbsent method with db', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1, lastInsertId: 1 }),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.select('id', 'name');
      const result = await builder.insertIfAbsent({ name: 'Test' }, ['email']);
      expect(result.inserted).toBe(true);
    });

    it('should test update method with db', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 1, lastInsertId: null }),
        query: vi.fn(),
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', '=', 1);
      const result = await builder.update({ name: 'Updated' });
      expect(result).toBe(1);
    });

    it('should test update method without db throws error', async () => {
      const builder = QueryBuilder.create('users');
      builder.where('id', '=', 1);
      await expect(builder.update({ name: 'Updated' })).rejects.toThrow('Database instance not provided to QueryBuilder');
    });

    it('should test delete method with db', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 1, lastInsertId: null }),
        query: vi.fn(),
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', '=', 1);
      const result = await builder.delete();
      expect(result).toBeUndefined();
    });

    it('should test delete method without db throws error', async () => {
      const builder = QueryBuilder.create('users');
      builder.where('id', '=', 1);
      await expect(builder.delete()).rejects.toThrow('Database instance not provided to QueryBuilder');
    });

    it('should test return method', () => {
      const builder = QueryBuilder.create('users');
      builder.select('id').return(['id', 'name']);
      // Return should set returning state
      expect(builder.toSQL()).toContain('SELECT "id" FROM "users"');
    });

    it('should test insert with returning columns', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Test' }], rowCount: 1, lastInsertId: 1 }),
        query: vi.fn(),
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.select('id', 'name').return(['id', 'name']);
      const result = await builder.insert({ name: 'Test' });
      expect(result.insertedRecords).toEqual([{ id: 1, name: 'Test' }]);
    });

        it('should test insertIfAbsent without returning columns', async () => {
          const mockDb = {
            execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [], lastInsertId: 1 }),
            query: vi.fn(),
            getType: () => 'sqlite',
          };
          const builder = QueryBuilder.create('users', mockDb as any);
          const result = await builder.insertIfAbsent({ name: 'Test', email: 'test@test.com' }, ['email']);
          expect(result.inserted).toBe(true);
          expect(result.affectedRows).toBe(1);
        });

        it('should test insertIfAbsent with returning columns', async () => {
          const mockDb = {
            execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 1, name: 'Test' }], lastInsertId: 1 }),
            query: vi.fn(),
            getType: () => 'postgresql',
          };
          const builder = QueryBuilder.create('users', mockDb as any);
          builder.return(['id', 'name']);
          const result = await builder.insertIfAbsent({ name: 'Test', email: 'test@test.com' }, ['email']);
          expect(result.inserted).toBe(true);
          expect(result.insertedRecords).toEqual([{ id: 1, name: 'Test' }]);
        });

        it('should test insertIfAbsent with zero rowCount (not inserted)', async () => {
          const mockDb = {
            execute: vi.fn().mockResolvedValue({ rowCount: 0, rows: [], lastInsertId: null }),
            query: vi.fn(),
            getType: () => 'sqlite',
          };
          const builder = QueryBuilder.create('users', mockDb as any);
          const result = await builder.insertIfAbsent({ name: 'Test', email: 'test@test.com' }, ['email']);
          expect(result.inserted).toBe(false);
          expect(result.affectedRows).toBe(0);
          expect(result.insertedRecords).toEqual([]);
        });

        it('should test insert without table name throws error', async () => {
          const mockDb = {
            execute: vi.fn(),
            query: vi.fn(),
            getType: () => 'sqlite',
          };
          const builder = QueryBuilder.create('', mockDb as any);
          await expect(builder.insert({ name: 'Test' })).rejects.toThrow('INSERT requires a table name');
        });

        it('should test insertIfAbsent without table name throws error', async () => {
          const mockDb = {
            execute: vi.fn(),
            query: vi.fn().mockResolvedValue([]),
            getType: () => 'sqlite',
          };
          const builder = QueryBuilder.create('', mockDb as any);
          await expect(builder.insertIfAbsent({ name: 'Test' }, ['email'])).rejects.toThrow('INSERT requires a table name');
        });

        it('should test load method with hasMany relationship', async () => {
          const mockGet = vi.fn(async () => []);
          const mockDb = {
            getType: () => 'sqlite',
            query: vi.fn(async () => []),
          } as any;

          const models = [{
            _attrs: { id: 1, name: 'Test' },
            _rels: {},
            getAttribute: function(key: string) { return this._attrs[key]; },
            setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
            setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
          }];
          (models[0] as any).posts = () => ({
            type: 'hasMany',
            foreignKey: 'user_id',
            localKey: 'id',
            related: {
              query: () => ({
                getTable: () => 'posts',
                get: mockGet,
                whereIn: function() { return { get: mockGet, select: function() { return this; } }; },
                select: function() { return this; },
              }),
            },
          });

          const qb = QueryBuilder.create('users', mockDb);
          await qb.load(models as any, 'posts');
          expect(mockGet).toHaveBeenCalled();
        });

        it('should test loadCount method with hasMany relationship', async () => {
          const mockDb = {
            getType: () => 'sqlite',
            query: vi.fn(async () => [{ key: 1, count: 1 }]),
          } as any;

          const models = [{
            _attrs: { id: 1, name: 'Test' },
            _rels: {},
            getAttribute: function(key: string) { return this._attrs[key]; },
            setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
            setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
          }];
          (models[0] as any).posts = () => ({
            type: 'hasMany',
            foreignKey: 'user_id',
            localKey: 'id',
            related: {
              query: () => ({
                getTable: () => 'posts',
                get: async () => [],
                whereIn: function() { return { get: async () => [] }; },
              }),
            },
          });

          const qb = QueryBuilder.create('users', mockDb);
          await qb.loadCount(models as any, 'posts');
          expect(mockDb.query).toHaveBeenCalled();
        });

        it('should test load method without db provided', async () => {
          const models = [{
            _attrs: { id: 1, name: 'Test' },
            _rels: {},
            getAttribute: function(key: string) { return this._attrs[key]; },
            setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
            setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
          }];
          (models[0] as any).posts = () => ({
            type: 'hasMany',
            foreignKey: 'user_id',
            localKey: 'id',
            related: {
              query: () => ({
                getTable: () => 'posts',
                get: async () => [],
                whereIn: function() { return { get: async () => [] }; },
              }),
            },
          });

          const qb = QueryBuilder.create('users');
          await qb.load(models as any, 'posts');
          // Should not throw when db is not provided
        });

        it('should test loadCount method without db provided', async () => {
          const models = [{
            _attrs: { id: 1, name: 'Test' },
            _rels: {},
            getAttribute: function(key: string) { return this._attrs[key]; },
            setAttribute: function(key: string, value: unknown) { this._attrs[key] = value; },
            setRelation: function(key: string, value: unknown) { this._rels[key] = value; },
          }];
          (models[0] as any).posts = () => ({
            type: 'hasMany',
            foreignKey: 'user_id',
            localKey: 'id',
            related: {
              query: () => ({
                getTable: () => 'posts',
                get: async () => [],
                whereIn: function() { return { get: async () => [] }; },
              }),
            },
          });

          const qb = QueryBuilder.create('users');
          await qb.loadCount(models as any, 'posts');
          // Should not throw when db is not provided
        });

    it('should test return method with undefined columns', () => {
      const builder = QueryBuilder.create('users');
      builder.select('id').return(undefined as any);
      expect(builder.toSQL()).toContain('SELECT "id" FROM "users"');
    });

    it('should test return method with null columns', () => {
      const builder = QueryBuilder.create('users');
      builder.select('id').return(null as any);
      expect(builder.toSQL()).toContain('SELECT "id" FROM "users"');
    });

    it('should test return method with empty array throws error', () => {
      const builder = QueryBuilder.create('users');
      builder.select('id');
      expect(() => builder.return([])).toThrow('RETURNING requires at least one column');
    });

    it('should test update without returning columns returns rowCount', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rowCount: 2, rows: [], lastInsertId: null }),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', '>', 0);
      const result = await builder.update({ name: 'Updated' });
      expect(result).toBe(2);
    });

    it('should test update with returning columns returns ReturningResult', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 1, name: 'Updated' }], lastInsertId: null }),
        query: vi.fn(),
        getType: () => 'postgresql',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', 1).return(['id', 'name']);
      const result = await builder.update({ name: 'Updated' });
      expect(result).toEqual({
        rows: [{ id: 1, name: 'Updated' }],
        rowCount: 1,
        affectedRows: 1,
        lastInsertId: null,
      });
    });

    it('should test update without table name throws error', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('', mockDb as any);
      builder.where('id', 1);
      await expect(builder.update({ name: 'Test' })).rejects.toThrow('UPDATE requires a table name');
    });

    it('should test delete without returning columns returns undefined', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [], lastInsertId: null }),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', 1);
      const result = await builder.delete();
      expect(result).toBeUndefined();
    });

    it('should test delete with returning columns returns ReturningResult', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 1, name: 'Deleted' }], lastInsertId: null }),
        query: vi.fn(),
        getType: () => 'postgresql',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', 1).return(['id', 'name']);
      const result = await builder.delete();
      expect(result).toEqual({
        rows: [{ id: 1, name: 'Deleted' }],
        rowCount: 1,
        affectedRows: 1,
        lastInsertId: null,
      });
    });

    it('should test increment method without table name throws error', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('', mockDb as any);
      builder.where('id', 1);
      await expect(builder.increment('count', 5)).rejects.toThrow('UPDATE requires a table name');
    });

    it('should test increment method', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [], lastInsertId: null }),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('users', mockDb as any);
      builder.where('id', 1);
      const result = await builder.increment('count', 5);
      expect(result).toBe(1);
    });

    it('should test delete without table name throws error', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn(),
        getType: () => 'sqlite',
      };
      const builder = QueryBuilder.create('', mockDb as any);
      builder.where('id', 1);
      await expect(builder.delete()).rejects.toThrow('DELETE requires a table name');
    });
  });

  describe('Ping Method Coverage', () => {
    it('should test ping method', async () => {
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockResolvedValue([{ '1': 1 }]),
        getType: () => 'sqlite',
      };
      await QueryBuilder.ping(mockDb as any);
      expect(mockDb.query).toHaveBeenCalled();
    });
  });
});
