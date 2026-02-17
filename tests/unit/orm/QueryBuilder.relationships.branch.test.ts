import { describe, expect, it, vi } from 'vitest';

import { QueryBuilder } from '@orm/QueryBuilder';

type ModelStub = {
  getAttribute: (key: string) => unknown;
  setAttribute: (key: string, value: unknown) => void;
  setRelation: (key: string, value: unknown) => void;
  getTable?: () => string;
  _attrs: Record<string, unknown>;
  _rels: Record<string, unknown>;
};

const createModel = (attrs: Record<string, unknown>, table?: string): ModelStub => {
  const model: ModelStub = {
    _attrs: { ...attrs },
    _rels: {},
    getAttribute: (key) => model._attrs[key],
    setAttribute: (key, value) => {
      model._attrs[key] = value;
    },
    setRelation: (key, value) => {
      model._rels[key] = value;
    },
  };
  if (typeof table === 'string') {
    model.getTable = () => table;
  }
  return model;
};

const createQuery = (results: unknown[]) => {
  const q: any = {
    whereIn: vi.fn(() => q),
    where: vi.fn(() => q),
    join: vi.fn(() => q),
    get: vi.fn(async () => results),
    getTable: vi.fn(() => 'related'),
  };
  return q;
};

describe('QueryBuilder relationship loaders (branch coverage)', () => {
  it('loadCount covers hasMany counts, count type coercion, and missing ids', async () => {
    const db = {
      getType: () => 'postgresql',
      query: vi.fn(async () => [
        { key: 1, count: 2n },
        { key: '2', count: 3 },
        { key: 3, count: '4' },
      ]),
    } as any;

    const models = [createModel({ id: 1 }), createModel({ id: '2' }), createModel({ id: null })];

    (models[0] as any).posts = () => ({
      type: 'hasMany',
      foreignKey: 'user_id',
      localKey: 'id',
      related: {
        query: () => ({
          getTable: () => 'posts',
          get: async () => [],
          whereIn: () => ({ get: async () => [] }),
        }),
      },
    });

    const qb = QueryBuilder.create('users', db);
    await qb.loadCount(models as any, 'posts');

    expect(models[0]._attrs['posts_count']).toBe(2);
    expect(models[1]._attrs['posts_count']).toBe(3);
    expect(models[2]._attrs['posts_count']).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('loadCount covers belongsToMany through-table branch', async () => {
    const db = {
      getType: () => 'sqlite',
      query: vi.fn(async () => [{ key: 1, count: 1 }]),
    } as any;

    const models = [createModel({ id: 1 })];
    (models[0] as any).roles = () => ({
      type: 'belongsToMany',
      foreignKey: 'user_id',
      localKey: 'id',
      throughTable: 'user_roles',
      relatedKey: 'role_id',
    });

    const qb = QueryBuilder.create('users', db);
    await qb.loadCount(models as any, 'roles');
    expect(models[0]._attrs['roles_count']).toBe(1);
  });

  it('loadCount returns early for unsupported relation types', async () => {
    const db = { getType: () => 'sqlite', query: vi.fn() } as any;
    const m = createModel({ id: 1 });
    (m as any).single = () => ({ type: 'hasOne', foreignKey: 'user_id', localKey: 'id' });
    const qb = QueryBuilder.create('users', db);
    await qb.loadCount([m] as any, 'single');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('load() covers standard hasMany bucketing and constraint handling', async () => {
    const parentA = createModel({ id: 1 });
    const parentB = createModel({ id: 'nope' });
    const child1 = createModel({ user_id: 1, id: 10 });
    const child2 = createModel({ user_id: 1, id: 11 });

    (parentA as any).comments = () => ({
      type: 'hasMany',
      foreignKey: 'user_id',
      localKey: 'id',
      related: {
        query: () => {
          const q = createQuery([child1, child2]);
          return q;
        },
      },
    });
    (parentB as any).comments = (parentA as any).comments;

    const qb = QueryBuilder.create('users');
    await qb.load([parentA, parentB] as any, 'comments', () => undefined as any);

    expect(Array.isArray(parentA._rels['comments'])).toBe(true);
    expect((parentA._rels['comments'] as any[]).length).toBe(2);
    expect(parentB._rels['comments']).toEqual([]);
  });

  it('load() covers morphTo groups and ignores unknown morphMap entries', async () => {
    const m1 = createModel({ owner_type: 'User', owner_id: 1 });
    const m2 = createModel({ owner_type: 'Missing', owner_id: 2 });

    (m1 as any).owner = () => ({
      type: 'morphTo',
      morphType: 'owner_type',
      morphId: 'owner_id',
      morphMap: {
        User: {
          query: () => createQuery([createModel({ id: 1 })]),
        },
      },
    });
    (m2 as any).owner = (m1 as any).owner;

    const qb = QueryBuilder.create('comments');
    await qb.load([m1, m2] as any, 'owner');

    expect(m1._rels['owner']).toBeTruthy();
    expect(m2._rels['owner']).toBeUndefined();
  });

  it('load() covers morphMany using model table name and buckets', async () => {
    const p1 = createModel({ id: 1 }, 'users');
    const p2 = createModel({ id: 2 }, 'users');

    (p1 as any).notes = () => ({
      type: 'morphMany',
      localKey: 'id',
      morphType: 'noteable_type',
      morphId: 'noteable_id',
      related: {
        query: () =>
          createQuery([
            createModel({ noteable_type: 'users', noteable_id: 1, id: 1 }),
            createModel({ noteable_type: 'users', noteable_id: 1, id: 2 }),
          ]),
      },
    });
    (p2 as any).notes = (p1 as any).notes;

    const qb = QueryBuilder.create('users');
    await qb.load([p1, p2] as any, 'notes');

    expect((p1._rels['notes'] as any[]).length).toBe(2);
    expect(p2._rels['notes']).toEqual([]);
  });

  it('load() covers morphOne (isMany=false) and sets null when key missing', async () => {
    const p1 = createModel({ id: 1 }, 'users');
    const p2 = createModel({ id: null }, 'users');

    (p1 as any).avatar = () => ({
      type: 'morphOne',
      localKey: 'id',
      morphType: 'imageable_type',
      morphId: 'imageable_id',
      related: {
        query: () =>
          createQuery([createModel({ imageable_type: 'users', imageable_id: 1, id: 9 })]),
      },
    });
    (p2 as any).avatar = (p1 as any).avatar;

    const qb = QueryBuilder.create('users');
    await qb.load([p1, p2] as any, 'avatar');

    expect(p1._rels['avatar']).toBeTruthy();
    expect(p2._rels['avatar']).toBeNull();
  });

  it('load() covers hasManyThrough and sets relations via through mapping', async () => {
    const parent = createModel({ id: 1 });

    const throughResults = [
      createModel({ user_id: 1, post_id: 10 }),
      createModel({ user_id: 1, post_id: 11 }),
    ];
    const relatedResults = [createModel({ id: 10, id_fk: 10 }), createModel({ id: 11, id_fk: 11 })];

    const throughModel = {
      getTable: () => 'user_posts',
      query: () => {
        const q: any = createQuery(throughResults);
        // loadThroughRelation calls whereIn(throughForeignKey, ids)
        return q;
      },
    };

    const relatedModel = {
      getTable: () => 'posts',
      query: () => {
        const q: any = createQuery(relatedResults);
        return q;
      },
    };

    (parent as any).postsThrough = () => ({
      type: 'hasManyThrough',
      through: throughModel,
      throughForeignKey: 'user_id',
      secondLocalKey: 'post_id',
      foreignKey: 'id_fk',
      localKey: 'id',
      related: relatedModel,
    });

    const qb = QueryBuilder.create('users');
    await qb.load([parent] as any, 'postsThrough');

    expect(Array.isArray(parent._rels['postsThrough'])).toBe(true);
    expect((parent._rels['postsThrough'] as any[]).length).toBe(2);
  });

  it('load() covers hasOneThrough (isMany=false)', async () => {
    const parent = createModel({ id: 1 });
    const throughResults = [createModel({ user_id: 1, post_id: 10 })];
    const relatedResults = [createModel({ id_fk: 10, id: 10 })];

    const throughModel = {
      getTable: () => 'user_posts',
      query: () => createQuery(throughResults),
    };

    const relatedModel = {
      getTable: () => 'posts',
      query: () => createQuery(relatedResults),
    };

    (parent as any).postThrough = () => ({
      type: 'hasOneThrough',
      through: throughModel,
      throughForeignKey: 'user_id',
      secondLocalKey: 'post_id',
      foreignKey: 'id_fk',
      localKey: 'id',
      related: relatedModel,
    });

    const qb = QueryBuilder.create('users');
    await qb.load([parent] as any, 'postThrough');
    expect(parent._rels['postThrough']).toBeTruthy();
  });
});
