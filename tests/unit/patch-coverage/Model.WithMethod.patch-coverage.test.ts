import { Model } from '@orm/Model';
import type { IQueryBuilder } from '@orm/QueryBuilder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orm/Database', () => {
  let db: unknown = {};
  return {
    useDatabase: vi.fn(() => db),
    __setDb: (next: unknown): void => {
      db = next;
    },
  };
});

describe('Model.with() patch coverage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const dbMod = (await import('@orm/Database')) as unknown as {
      __setDb: (next: unknown) => void;
    };
    dbMod.__setDb({});
  });

  it('delegates string shorthand for eager loading', () => {
    const TestModel = Model.define({
      table: 'test_model',
      fillable: [],
      hidden: [],
      casts: {},
    });

    const qb = TestModel.with('author');

    expect(qb).toBeDefined();
    expect((qb as unknown as { getEagerLoads: () => string[] }).getEagerLoads()).toEqual([
      'author',
    ]);
  });

  it('delegates array shorthand for eager loading', () => {
    const TestModel = Model.define({
      table: 'test_model',
      fillable: [],
      hidden: [],
      casts: {},
    });

    const qb = TestModel.with(['author', 'comments']);

    expect((qb as unknown as { getEagerLoads: () => string[] }).getEagerLoads()).toEqual([
      'author',
      'comments',
    ]);
  });

  it('delegates object constraints shorthand for eager loading', () => {
    const TestModel = Model.define({
      table: 'test_model',
      fillable: [],
      hidden: [],
      casts: {},
    });

    const constraint = (builder: IQueryBuilder): IQueryBuilder => builder.where('id', 1);
    const qb = TestModel.with({ author: constraint });

    expect((qb as unknown as { getEagerLoads: () => string[] }).getEagerLoads()).toEqual([
      'author',
    ]);
    expect(
      (
        qb as unknown as { getEagerLoadConstraints: () => Record<string, unknown> }
      ).getEagerLoadConstraints()
    ).toHaveProperty('author');
  });
});
