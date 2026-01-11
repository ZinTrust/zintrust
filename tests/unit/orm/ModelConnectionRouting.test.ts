import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => ({})),
}));

vi.mock('@orm/QueryBuilder', () => {
  const createBuilder = () => {
    const builder = {
      where: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      first: vi.fn(async () => ({ id: 1 })),
      get: vi.fn(async () => [{ id: 1 }]),
    };
    return builder;
  };

  return {
    QueryBuilder: {
      create: vi.fn(() => createBuilder()),
      ping: vi.fn(async () => undefined),
    },
  };
});

describe('ModelConnectionRouting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes Model.query(table, connection) to useDatabase(connection)', async () => {
    const { query } = await import('@orm/Model');
    const { useDatabase } = await import('@orm/Database');

    query('users', 'connA');

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'connA');
  });

  it('routes createModel(config.connection) to useDatabase(config.connection)', async () => {
    const { createModel } = await import('@orm/Model');
    const { useDatabase } = await import('@orm/Database');

    const model = createModel({
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
      connection: 'connB',
    });

    await model.save();

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'connB');
  });

  it('routes DefinedModel.query() to useDatabase(config.connection)', async () => {
    const { Model } = await import('@orm/Model');
    const { useDatabase } = await import('@orm/Database');

    const User = Model.define({
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
      connection: 'auth',
    });

    User.query();

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'auth');
  });

  it('allows overriding connection via DefinedModel.db(name)', async () => {
    const { Model } = await import('@orm/Model');
    const { useDatabase } = await import('@orm/Database');

    const User = Model.define({
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
      connection: 'auth',
    });

    User.db('reg').query();

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'reg');
  });
});
