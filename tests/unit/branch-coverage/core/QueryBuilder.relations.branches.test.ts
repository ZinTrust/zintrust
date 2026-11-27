/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it, vi } from 'vitest';

const makeDb = (results: any[] = []) => {
  const query = vi.fn(async () =>
    results.map((row) => ({
      ...row,
      attributes: { ...row },
      getAttribute: (key: string) => row[key] ?? null,
    }))
  );
  return { db: { query, getType: () => 'sqlite' } as any, query };
};

const makeModel = (
  attributes: Record<string, unknown>,
  relation?: string,
  relFactory?: () => any
): any => {
  const model: any = {
    attributes: { ...attributes },
    relations: {} as Record<string, unknown>,
    getAttribute: (key: string) => model.attributes[key] ?? null,
    setAttribute: (key: string, value: unknown) => {
      model.attributes[key] = value;
    },
    setRelation: (key: string, value: unknown) => {
      model.relations[key] = value;
    },
  };
  if (relation && relFactory) model[relation] = relFactory;
  return model;
};

const makeRelated = (db: any, table = 'related') => ({
  query: () => QueryBuilder.create(table, db),
  getTable: () => table,
});

describe('QueryBuilder eager-load branch coverage', () => {
  it('covers loadCounts guards and count normalization', async () => {
    const { db, query } = makeDb([{ key: 1, count: 4n }, { key: 2, count: null }]);

    const noRel = makeModel({ id: 1 }, 'posts', () => null);
    await QueryBuilder.create('users', db).loadCount([noRel], 'posts');

    const unsupported = makeModel({ id: 1 }, 'posts', () => ({
      type: 'hasOne',
      foreignKey: 'user_id',
      localKey: 'id',
    }));
    await QueryBuilder.create('users', db).loadCount([unsupported], 'posts');

    const noIds = [
      makeModel({ id: null }, 'posts', () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: makeRelated(db, 'posts'),
      })),
    ];
    await QueryBuilder.create('users', db).loadCount(noIds, 'posts');

    const noQuery = [
      makeModel({ id: 1 }, 'posts', () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: {},
      })),
    ];
    await QueryBuilder.create('users', db).loadCount(noQuery, 'posts');

    const valid = [
      makeModel({ id: 1 }, 'posts', () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: makeRelated(db, 'posts'),
      })),
      makeModel({ id: 2 }, 'posts', () => ({
        type: 'hasMany',
        foreignKey: 'user_id',
        localKey: 'id',
        related: makeRelated(db, 'posts'),
      })),
    ];
    await QueryBuilder.create('users', db).loadCount(valid, 'posts');
    expect(valid[0].attributes['posts_count']).toBe(4);
    expect(valid[1].attributes['posts_count']).toBe(0);
    expect(query).toHaveBeenCalled();
  });

  it('covers belongsToMany count guards', async () => {
    const { db } = makeDb([{ key: 1, count: 2 }]);
    const badConfig = [
      makeModel({ id: 1 }, 'roles', () => ({
        type: 'belongsToMany',
        throughTable: '',
        relatedKey: '',
        foreignKey: 'user_id',
        localKey: 'id',
      })),
    ];
    await QueryBuilder.create('users', db).loadCount(badConfig, 'roles');

    const valid = [
      makeModel({ id: 1 }, 'roles', () => ({
        type: 'belongsToMany',
        throughTable: 'role_user',
        relatedKey: 'role_id',
        foreignKey: 'user_id',
        localKey: 'id',
      })),
    ];
    await QueryBuilder.create('users', db).loadCount(valid, 'roles');
    expect(valid[0].attributes['roles_count']).toBe(2);
  });

  it('covers hasOne/hasMany bucket assignment and invalid keys', async () => {
    const { db } = makeDb([
      { id: 10, user_id: 1 },
      { id: 11, user_id: 1 },
    ]);
    const rel = () => ({
      type: 'hasMany',
      localKey: 'id',
      foreignKey: 'user_id',
      related: makeRelated(db, 'posts'),
    });

    const models = [makeModel({ id: 1 }, 'posts', rel), makeModel({ id: null }, 'posts', rel)];
    await QueryBuilder.create('users', db).load(models, 'posts');
    expect(models[0].relations['posts']).toHaveLength(2);
    expect(models[1].relations['posts']).toEqual([]);

    const one = [makeModel({ id: 5 }, 'profile', () => ({
      type: 'hasOne',
      localKey: 'id',
      foreignKey: 'user_id',
      related: makeRelated(db, 'profiles'),
    }))];
    await QueryBuilder.create('users', db).load(one, 'profile');
    expect(one[0].relations['profile']).toBeNull();
  });

  it('covers belongsTo relation guards and fallbacks', async () => {
    const { db } = makeDb([{ id: 7, name: 'owner' }]);
    const relFor = (overrides: Record<string, unknown> = {}) => () => ({
      type: 'belongsTo',
      foreignKey: 'owner_id',
      localKey: 'id',
      related: makeRelated(db, 'owners'),
      ...overrides,
    });

    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'owner', relFor({ foreignKey: '' }))],
      'owner'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'owner', relFor({ related: {} }))],
      'owner'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1, owner_id: null }, 'owner', relFor())],
      'owner'
    );

    const valid = [makeModel({ id: 1, owner_id: 7 }, 'owner', relFor())];
    await QueryBuilder.create('users', db).load(valid, 'owner');
    expect((valid[0].relations['owner'] as any).attributes.id).toBe(7);
  });

  it('covers through relation guards and successful hydration', async () => {
    const { db } = makeDb([{ user_id: 1, id: 9 }, { post_id: 9, id: 90 }]);
    const through = { query: () => QueryBuilder.create('profiles', db), getTable: () => 'profiles' };
    const related = makeRelated(db, 'posts');
    const relFor = (overrides: Record<string, unknown> = {}) => () => ({
      type: 'hasOneThrough',
      through,
      throughForeignKey: 'user_id',
      secondLocalKey: 'id',
      foreignKey: 'post_id',
      localKey: 'id',
      related,
      ...overrides,
    });

    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'post', relFor({ through: undefined }))],
      'post'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: null }, 'post', relFor())],
      'post'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'post', relFor({ related: {} }))],
      'post'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'post', relFor({ through: { query: () => null } }))],
      'post'
    );

    const valid = [makeModel({ id: 1 }, 'post', relFor())];
    await QueryBuilder.create('users', db).load(valid, 'post');
    expect((valid[0].relations['post'] as any).attributes.id).toBe(90);
  });

  it('covers belongsToMany relation guards and table-name resolution', async () => {
    const { db } = makeDb([{ id: 3, __zin_belongs_to_many_parent_key: 1 }]);
    const relFor = (related: any) => () => ({
      type: 'belongsToMany',
      throughTable: 'role_user',
      foreignKey: 'user_id',
      relatedKey: 'role_id',
      localKey: 'id',
      related,
    });

    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'roles', relFor(makeRelated(db)))],
      'roles'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'roles', relFor({ query: () => QueryBuilder.create('roles', db) }))],
      'roles'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'roles', relFor({ getTable: () => '' }))],
      'roles'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'roles', relFor({}))],
      'roles'
    );

    const valid = [makeModel({ id: 1 }, 'roles', relFor(makeRelated(db, 'roles')))];
    await QueryBuilder.create('users', db).load(valid, 'roles');
    expect((valid[0].relations['roles'] as any)[0].attributes.id).toBe(3);
  });

  it('covers morphTo and morphOne/Many guard branches', async () => {
    const { db } = makeDb([{ id: 4, commentable_id: 1 }]);
    const related = makeRelated(db, 'posts');
    const morphTo = (overrides: Record<string, unknown> = {}) => () => ({
      type: 'morphTo',
      morphType: 'commentable_type',
      morphId: 'commentable_id',
      morphMap: { Post: related },
      ...overrides,
    });

    await QueryBuilder.create('comments', db).load(
      [makeModel({ id: 1 }, 'commentable', morphTo({ morphType: '' }))],
      'commentable'
    );
    await QueryBuilder.create('comments', db).load(
      [makeModel({ id: 1, commentable_type: 'Missing' }, 'commentable', morphTo())],
      'commentable'
    );
    await QueryBuilder.create('comments', db).load(
      [makeModel({ id: 1, commentable_type: 'Post', commentable_id: 1 }, 'commentable', morphTo())],
      'commentable'
    );

    const morphOne = (overrides: Record<string, unknown> = {}) => () => ({
      type: 'morphOne',
      morphType: 'imageable_type',
      morphId: 'imageable_id',
      localKey: 'id',
      related,
      ...overrides,
    });
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'image', morphOne({ localKey: undefined }))],
      'image'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: null }, 'image', morphOne())],
      'image'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'image', morphOne({ related: {} }))],
      'image'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'image', morphOne())],
      'image'
    );
  });

  it('covers morph type grouping, invalid model tables and invalid related ids', async () => {
    const { db } = makeDb([
      { id: null, imageable_id: 1 },
      { imageable_id: null },
    ]);
    const related = makeRelated(db, 'images');
    const rel = () => ({
      type: 'morphMany',
      morphType: 'imageable_type',
      morphId: 'imageable_id',
      localKey: 'id',
      related,
    });

    const noGetter = makeModel({ id: 1, imageable_type: 'User' }, 'image', rel);
    const emptyTable = makeModel({ id: 2, imageable_type: 'User' }, 'image', rel);
    emptyTable.getTable = () => '';

    await QueryBuilder.create('users', db).load([noGetter, emptyTable], 'image');
    expect(noGetter.relations['image']).toBeUndefined();

    const relatedNoGetter = {
      query: () => QueryBuilder.create('owners', db),
    };
    const belongsTo = () => ({
      type: 'belongsTo',
      foreignKey: 'owner_id',
      localKey: 'id',
      related: relatedNoGetter,
    });
    const ownerModel = makeModel({ id: 1, owner_id: 9 }, 'owner', belongsTo);
    await QueryBuilder.create('users', db).load([ownerModel], 'owner');
    expect(ownerModel.relations['owner']).toBeNull();
  });

  it('covers standard relation guards and eager-load constraint merging', async () => {
    const { db } = makeDb([{ id: 12, user_id: 1 }]);
    const relFor = (overrides: Record<string, unknown> = {}) => () => ({
      type: 'hasMany',
      localKey: 'id',
      foreignKey: 'user_id',
      related: makeRelated(db, 'posts'),
      ...overrides,
    });

    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'posts', relFor({ related: null }))],
      'posts'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'posts', relFor({ foreignKey: '' }))],
      'posts'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: null }, 'posts', relFor())],
      'posts'
    );
    await QueryBuilder.create('users', db).load(
      [makeModel({ id: 1 }, 'posts', relFor({ related: {} }))],
      'posts'
    );

    const valid = [makeModel({ id: 1 }, 'posts', relFor())];
    const constraint = vi.fn((q: any) => q);
    await QueryBuilder.create('users', db).load(valid, 'posts', constraint);
    expect(constraint).toHaveBeenCalled();
    expect((valid[0].relations['posts'] as any)[0].attributes.id).toBe(12);

    const builder = QueryBuilder.create('users', db)
      .with({ posts: (q) => q })
      .with({ posts: (q) => q });
    expect(builder.toSQL()).toContain('SELECT');
  });
});
