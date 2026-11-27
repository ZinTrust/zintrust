/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

import { QueryBuilder } from '@orm/QueryBuilder';

const makeModel = (
  attributes: Record<string, unknown>,
  relationName?: string,
  rel?: any,
  table = 'parents'
) => ({
  getAttribute: (key: string) => attributes[key],
  setAttribute: vi.fn(),
  setRelation: vi.fn(),
  getTable: () => table,
  ...(relationName && rel ? { [relationName]: () => rel } : {}),
});

const chainable = (results: unknown[], extra: Record<string, any> = {}) => {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    selectAs: vi.fn().mockReturnThis(),
    get: vi.fn(async () => results),
    ...extra,
  };
  return builder;
};

const makeRelated = (table: string, results: unknown[] = []) => {
  const builder = chainable(results, { getTable: () => table });
  return { query: () => builder, getTable: () => table };
};

describe('QueryBuilder eager-loading uncovered branches (final-orm)', () => {
  it.each(['hasManyThrough', 'hasOneThrough'] as const)(
    'sets empty through relations for %s edge-case models',
    async (type) => {
      const isMany = type === 'hasManyThrough';
      const throughBuilder = chainable([makeModel({ parent_id: 3, id: 'through-1' })]);
      const rel = {
        type,
        through: { query: () => throughBuilder, getTable: () => 'pivots' },
        related: makeRelated('comments', []),
        throughForeignKey: 'parent_id',
        secondLocalKey: 'id',
        foreignKey: 'comment_id',
        localKey: 'id',
      };
      const models = [
        makeModel({}, 'through', rel),
        makeModel({ id: 2 }, 'through', rel),
        makeModel({ id: 3 }, 'through', rel),
      ];

      const qb = QueryBuilder.create('parents');
      await expect(qb.load(models as any, 'through')).resolves.toBeUndefined();

      expect(models[0].setRelation).toHaveBeenCalledWith('through', isMany ? [] : null);
      expect(models[1].setRelation).toHaveBeenCalledWith('through', isMany ? [] : null);
      expect(models[2].setRelation).toHaveBeenCalledWith('through', isMany ? [] : null);
    }
  );

  it('skips through relations when the through table is empty', async () => {
    const rel = {
      type: 'hasManyThrough',
      through: { query: () => chainable([]), getTable: () => '' },
      related: makeRelated('comments'),
      throughForeignKey: 'parent_id',
      secondLocalKey: 'id',
      foreignKey: 'comment_id',
      localKey: 'id',
    };
    const model = makeModel({ id: 1 }, 'through', rel);

    const qb = QueryBuilder.create('parents');
    await expect(qb.load([model] as any, 'through')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it('groups multiple morphTo models of the same type and assigns valid ids', async () => {
    const related = makeRelated('posts', [makeModel({ id: 10 })]);
    const rel = {
      type: 'morphTo',
      morphType: 'subject_type',
      morphId: 'subject_id',
      morphMap: { post: related },
    };
    const first = makeModel({ subject_type: 'post', subject_id: 10 }, 'subject', rel);
    const second = makeModel({ subject_type: 'post', subject_id: 11 }, 'subject', rel);
    const third = makeModel({ subject_type: 'post', subject_id: null }, 'subject', rel);

    const qb = QueryBuilder.create('comments');
    await expect(qb.load([first, second, third] as any, 'subject')).resolves.toBeUndefined();
    expect(first.setRelation).toHaveBeenCalled();
    expect(second.setRelation).toHaveBeenCalledWith('subject', null);
  });

  it('ignores morphTo models without a type string', async () => {
    const rel = {
      type: 'morphTo',
      morphType: 'subject_type',
      morphId: 'subject_id',
      morphMap: { post: makeRelated('posts') },
    };
    const model = makeModel({ subject_type: '', subject_id: 10 }, 'subject', rel);

    const qb = QueryBuilder.create('comments');
    await expect(qb.load([model] as any, 'subject')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it('skips the morphTo query when no group member has a usable id', async () => {
    const rel = {
      type: 'morphTo',
      morphType: 'subject_type',
      morphId: 'subject_id',
      morphMap: { post: makeRelated('posts') },
    };
    const model = makeModel({ subject_type: 'post', subject_id: null }, 'subject', rel);

    const qb = QueryBuilder.create('comments');
    await expect(qb.load([model] as any, 'subject')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it('skips morph one/many loading when the parent table is empty', async () => {
    const rel = {
      type: 'morphMany',
      morphType: 'commentable_type',
      morphId: 'commentable_id',
      localKey: 'id',
      related: makeRelated('comments'),
    };
    const model = makeModel({ id: 1 }, 'comments', rel, '');

    const qb = QueryBuilder.create('parents');
    await expect(qb.load([model] as any, 'comments')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it.each([
    ['empty getTable result', { getTable: () => '' }, undefined],
    ['query-only related with empty table', {}, () => chainable([], { getTable: () => '' })],
  ] as const)('skips belongsToMany with %s', async (_label, relatedExtra, queryFactory) => {
    const related: any = queryFactory
      ? { query: queryFactory }
      : { query: () => chainable([]), getTable: relatedExtra.getTable };
    const rel = {
      type: 'belongsToMany',
      throughTable: 'pivots',
      foreignKey: 'parent_id',
      relatedKey: 'comment_id',
      localKey: 'id',
      related,
    };
    const model = makeModel({ id: 1 }, 'comments', rel);

    const qb = QueryBuilder.create('parents');
    await expect(qb.load([model] as any, 'comments')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });

  it('skips belongsToMany when the pivot table is blank', async () => {
    const rel = {
      type: 'belongsToMany',
      throughTable: '',
      foreignKey: 'parent_id',
      relatedKey: 'comment_id',
      localKey: 'id',
      related: makeRelated('comments'),
    };
    const model = makeModel({ id: 1 }, 'comments', rel);

    const qb = QueryBuilder.create('parents');
    await expect(qb.load([model] as any, 'comments')).resolves.toBeUndefined();
    expect(model.setRelation).not.toHaveBeenCalled();
  });
});
