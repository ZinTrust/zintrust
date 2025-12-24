import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Model, type IModel, type ModelConfig, type ModelStatic } from '@orm/Model';

const fakePass = 'pdd';
vi.mock('@orm/Database', () => {
  let db: unknown = {};
  return {
    useDatabase: vi.fn(() => db),
    __setDb: (next: unknown): void => {
      db = next;
    },
  };
});

type MockBuilder = {
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  table: string;
};

vi.mock('@orm/QueryBuilder', () => {
  let lastBuilder: MockBuilder | undefined;

  const QueryBuilder = {
    create: vi.fn((table: string) => {
      const builder: MockBuilder = {
        table,
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        join: vi.fn().mockReturnThis(),
        first: vi.fn(async () => null),
        get: vi.fn(async () => []),
      };
      lastBuilder = builder;
      return builder;
    }),
  };

  return {
    QueryBuilder,
    __getLastBuilder: (): MockBuilder | undefined => lastBuilder,
  };
});

const baseConfig: ModelConfig = {
  table: 'test_models',
  fillable: ['name', 'email', 'active', 'age', 'score', 'born', 'seenAt', 'meta', 'password'],
  hidden: ['password'],
  timestamps: true,
  casts: {
    active: 'boolean',
    age: 'integer',
    score: 'float',
    born: 'date',
    seenAt: 'datetime',
    meta: 'json',
  },
};

describe('Model', () => {
  beforeEach(async (): Promise<void> => {
    vi.clearAllMocks();
    vi.resetModules();
    const dbMod = (await import('@orm/Database')) as unknown as {
      __setDb: (next: unknown) => void;
    };
    dbMod.__setDb({});
  });

  it('fills attributes, applies casts, respects fillable and hidden', async (): Promise<void> => {
    const TestModel = Model.define(baseConfig);
    const m = TestModel.create({
      name: 'John',
      email: 'john@example.com',
      password: fakePass,
      active: '1',
      age: '42',
      score: '1.5',
      born: '2025-01-02T03:04:05.000Z',
      seenAt: '2025-01-02T03:04:05.000Z',
      meta: '{"a":1}',
    });

    expect(m.getAttribute('active')).toBe(true);
    expect(m.getAttribute('age')).toBe(42);
    expect(m.getAttribute('score')).toBe(1.5);
    expect(m.getAttribute('born')).toBe('2025-01-02');
    expect(m.getAttribute('seenAt')).toBe('2025-01-02T03:04:05.000Z');
    expect(m.getAttribute('meta')).toEqual({ a: 1 });

    const json = m.toJSON();
    expect(json['name']).toBe('John');
    expect(json['password']).toBeUndefined();
  });

  it('fillable list filters unknown keys; empty fillable allows all', async (): Promise<void> => {
    const Limited = Model.define({
      ...baseConfig,
      fillable: ['name'],
      casts: {},
    });

    const m1 = Limited.create({ name: 'A', email: 'nope' });
    expect(m1.getAttribute('name')).toBe('A');
    expect(m1.getAttribute('email')).toBeUndefined();

    m1.fill({ email: 'still-nope' });
    expect(m1.getAttribute('email')).toBeUndefined();

    const Open = Model.define({
      ...baseConfig,
      fillable: [],
      casts: {},
    });

    const m2 = Open.create({ name: 'B', email: 'yes' });
    expect(m2.getAttribute('email')).toBe('yes');
  });

  it('tracks dirty state and existence', async (): Promise<void> => {
    const TestModel = Model.define({ ...baseConfig, casts: {} });
    const m = TestModel.create({ name: 'A' });

    expect(m.isDirty()).toBe(false);
    expect(m.isDirty('name')).toBe(false);

    m.setAttribute('name', 'B');
    expect(m.isDirty()).toBe(true);
    expect(m.isDirty('name')).toBe(true);

    expect(m.exists()).toBe(false);
    m.setExists(true);
    expect(m.exists()).toBe(true);
  });

  it('save throws when DB not initialized; save sets timestamps when enabled', async (): Promise<void> => {
    const dbMod = (await import('@orm/Database')) as unknown as {
      __setDb: (next: unknown) => void;
    };

    const TestModel = Model.define({ ...baseConfig, casts: {} });

    dbMod.__setDb(undefined);
    const noDbModel = TestModel.create({ name: 'A' });
    await expect(noDbModel.save()).rejects.toMatchObject({ code: 'DATABASE_ERROR' });

    dbMod.__setDb({});
    const m = TestModel.create({ name: 'A' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    await expect(m.save()).resolves.toBe(true);
    expect(m.getAttribute('created_at')).toBe('2025-01-01T00:00:00.000Z');
    expect(m.getAttribute('updated_at')).toBe('2025-01-01T00:00:00.000Z');

    vi.useRealTimers();
  });

  it('delete returns false when not exists; true when exists and db present', async (): Promise<void> => {
    const TestModel = Model.define({ ...baseConfig, casts: {} });
    const m = TestModel.create({ name: 'A' });

    await expect(m.delete()).resolves.toBe(false);

    m.setExists(true);
    await expect(m.delete()).resolves.toBe(true);
  });

  it('find returns null when missing, otherwise returns an existing model', async (): Promise<void> => {
    const config = { ...baseConfig, casts: {}, timestamps: false };
    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };

    const builderMod = await import('@orm/QueryBuilder');
    // first call returns null
    await expect(Model.find(config, 1)).resolves.toBeNull();

    const last1 = qb.__getLastBuilder();
    expect(last1?.where).toHaveBeenCalledWith('id', '=', '1');
    expect(last1?.limit).toHaveBeenCalledWith(1);

    // second call returns a row
    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => ({ id: 2, name: 'X' })),
      get: vi.fn(async () => []),
    } satisfies MockBuilder);

    const found = await Model.find(config, 2);
    expect(found).not.toBeNull();
    expect(found?.exists()).toBe(true);
    expect(found?.getAttribute('name')).toBe('X');
  });

  it('all maps rows to existing models', async (): Promise<void> => {
    const config = { ...baseConfig, casts: {}, timestamps: false };
    const builderMod = await import('@orm/QueryBuilder');

    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => null),
      get: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
    } satisfies MockBuilder);

    const all = await Model.all(config);
    expect(all).toHaveLength(2);
    expect(all[0].exists()).toBe(true);
    expect(all[1].exists()).toBe(true);
  });

  it('define attaches custom methods', async (): Promise<void> => {
    const Test = Model.define(
      { ...baseConfig, casts: {}, timestamps: false },
      {
        greet: (m: IModel, prefix: unknown): string =>
          `${String(prefix)} ${String(m.getAttribute('name'))}`,
      }
    );

    const m = Test.create({ name: 'Zin' });
    expect((m as IModel & { greet: (p: string) => string }).greet('hi')).toBe('hi Zin');
  });

  it('relationship defaults route through related query builder', async (): Promise<void> => {
    const config: ModelConfig = {
      ...baseConfig,
      casts: {},
      timestamps: false,
      fillable: ['id', 'user_id'],
      hidden: [],
    };
    const Test = Model.define(config);

    const relatedBuilder = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => ({ ok: true })),
      get: vi.fn(async () => [{ ok: true }]),
    };

    const Related = {
      name: 'User',
      getTable: (): string => 'users',
      query: (): unknown => relatedBuilder,
    };

    const m = Test.create({ id: '5', user_id: '9' });

    const relatedModel = Related as unknown as ModelStatic;

    await m.hasOne(relatedModel).get(m);
    expect(relatedBuilder.where).toHaveBeenCalledWith('test_model_id', '=', '5');

    await m.belongsTo(relatedModel).get(m);
    expect(relatedBuilder.where).toHaveBeenCalledWith('id', '=', '9');

    await m.belongsToMany(relatedModel).get(m);
    expect(relatedBuilder.join).toHaveBeenCalledWith(
      'test_models_users',
      'users.id = test_models_users.user_id'
    );
    expect(relatedBuilder.where).toHaveBeenCalledWith('test_models_users.test_model_id', '5');
  });
});
