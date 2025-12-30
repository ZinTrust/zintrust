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

    createModel({
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
      connection: 'connB',
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'connB');
  });

  it('routes find/all to useDatabase(config.connection)', async () => {
    const { find, all } = await import('@orm/Model');
    const { useDatabase } = await import('@orm/Database');

    await find(
      {
        table: 'users',
        fillable: [],
        hidden: [],
        timestamps: false,
        casts: {},
        connection: 'connC',
      },
      1
    );

    await all({
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
      connection: 'connD',
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'connC');
    expect(useDatabase).toHaveBeenCalledWith(undefined, 'connD');
  });
});
