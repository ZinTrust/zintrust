import { describe, expect, it, vi } from 'vitest';

const createFakeBuilder = () => {
  const builder = {
    where: vi.fn(() => builder),
    andWhere: vi.fn(() => builder),
    orWhere: vi.fn(() => builder),
    whereIn: vi.fn(() => builder),
    whereNotIn: vi.fn(() => builder),
    select: vi.fn(() => builder),
    selectAs: vi.fn(() => builder),
    max: vi.fn(() => builder),
    join: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => builder),
    withTrashed: vi.fn(() => builder),
    onlyTrashed: vi.fn(() => builder),
    withoutTrashed: vi.fn(() => builder),
    insert: vi.fn(async () => ({ insertId: 1, affectedRows: 1 })),
    get: vi.fn(async () => []),
  };

  return builder;
};

let lastBuilder: ReturnType<typeof createFakeBuilder> | undefined;

vi.mock('@orm/QueryBuilder', () => {
  return {
    QueryBuilder: {
      create: vi.fn(() => {
        lastBuilder = createFakeBuilder();
        return lastBuilder as any;
      }),
    },
    default: {
      create: vi.fn(() => {
        lastBuilder = createFakeBuilder();
        return lastBuilder as any;
      }),
    },
  };
});

vi.mock('@orm/Database', () => {
  const fakeDb = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    isConnected: vi.fn(() => true),
    query: vi.fn(async () => []),
    queryOne: vi.fn(async () => null),
    transaction: vi.fn(async (cb: any) => cb(fakeDb)),
    table: vi.fn(() => ({})),
    onBeforeQuery: vi.fn(),
    onAfterQuery: vi.fn(),
    offBeforeQuery: vi.fn(),
    offAfterQuery: vi.fn(),
    getAdapterInstance: vi.fn(),
    getType: vi.fn(() => 'sqlite'),
    getConfig: vi.fn(() => ({ driver: 'sqlite', database: ':memory:' })),
    dispose: vi.fn(),
  };

  return {
    useDatabase: vi.fn(() => fakeDb),
    useEnsureDbConnected: vi.fn(async () => fakeDb),
    resetDatabase: vi.fn(async () => undefined),
    Database: {
      create: vi.fn(() => fakeDb),
    },
  };
});

describe('patch coverage: Model query wrappers + insert', () => {
  it('delegates wrapper methods to a fresh underlying builder', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    const cfg = {
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
    };

    const Users = core.Model.define(cfg);

    Users.select('id');
    expect(lastBuilder?.select).toHaveBeenCalledWith('id');

    Users.selectAs('id', 'user_id');
    expect(lastBuilder?.selectAs).toHaveBeenCalledWith('id', 'user_id');

    Users.max('id', 'max_id');
    expect(lastBuilder?.max).toHaveBeenCalledWith('id', 'max_id');

    Users.join('orgs', 'users.org_id = orgs.id');
    expect(lastBuilder?.join).toHaveBeenCalled();

    Users.leftJoin('orgs', 'users.org_id = orgs.id');
    expect(lastBuilder?.leftJoin).toHaveBeenCalled();

    Users.orderBy('id', 'DESC');
    expect(lastBuilder?.orderBy).toHaveBeenCalledWith('id', 'DESC');

    Users.limit(10);
    expect(lastBuilder?.limit).toHaveBeenCalledWith(10);

    Users.offset(5);
    expect(lastBuilder?.offset).toHaveBeenCalledWith(5);

    Users.withTrashed();
    expect(lastBuilder?.withTrashed).toHaveBeenCalled();

    Users.onlyTrashed();
    expect(lastBuilder?.onlyTrashed).toHaveBeenCalled();

    Users.withoutTrashed();
    expect(lastBuilder?.withoutTrashed).toHaveBeenCalled();
  });

  it('covers Model.insert and bulkInsert wrappers', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    const cfg = {
      table: 'users',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
    };

    const single = await core.Model.insert(cfg, { name: 'a' });
    expect(single).toEqual({ insertId: 1, affectedRows: 1 });
    expect(lastBuilder?.insert).toHaveBeenCalledWith({ name: 'a' });

    const bulk = await core.Model.bulkInsert(cfg, [{ name: 'a' }, { name: 'b' }]);
    expect(bulk).toEqual({ insertId: 1, affectedRows: 1 });
    expect(lastBuilder?.insert).toHaveBeenCalledWith([{ name: 'a' }, { name: 'b' }]);
  });
});
