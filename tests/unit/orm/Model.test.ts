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
  firstOrFail: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  paginate: ReturnType<typeof vi.fn>;
  with: ReturnType<typeof vi.fn>;
  withCount: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
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
        firstOrFail: vi.fn(async () => {
          throw new Error('not found');
        }),
        get: vi.fn(async () => []),
        paginate: vi.fn(async () => ({
          items: [],
          total: 0,
          perPage: 10,
          currentPage: 1,
          lastPage: 1,
          from: 0,
          to: 0,
          links: {},
        })),
        with: vi.fn().mockReturnThis(),
        withCount: vi.fn().mockReturnThis(),
        insert: vi.fn(async () => ({ id: 1, affectedRows: 1 })),
        update: vi.fn(async () => undefined),
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
    const m = TestModel.make({
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

    const m1 = Limited.make({ name: 'A', email: 'nope' });
    expect(m1.getAttribute('name')).toBe('A');
    expect(m1.getAttribute('email')).toBeUndefined();

    m1.fill({ email: 'still-nope' });
    expect(m1.getAttribute('email')).toBeUndefined();

    const Open = Model.define({
      ...baseConfig,
      fillable: [],
      casts: {},
    });

    const m2 = Open.make({ name: 'B', email: 'yes' });
    expect(m2.getAttribute('email')).toBe('yes');
  });

  it('tracks dirty state and existence', async (): Promise<void> => {
    const TestModel = Model.define({ ...baseConfig, casts: {} });
    const m = TestModel.make({ name: 'A' });

    expect(m.isDirty()).toBe(false);
    expect(m.isDirty('name')).toBe(false);

    m.setAttribute('name', 'B');
    expect(m.isDirty()).toBe(true);
    expect(m.isDirty('name')).toBe(true);

    expect(m.exists()).toBe(false);
    m.setExists(true);
    expect(m.exists()).toBe(true);
  });

  it('create throws when DB not initialized; create persists inserts and sets timestamps when enabled', async (): Promise<void> => {
    const dbMod = (await import('@orm/Database')) as unknown as {
      __setDb: (next: unknown) => void;
    };

    const TestModel = Model.define({ ...baseConfig, casts: {} });

    dbMod.__setDb(undefined);
    await expect(TestModel.create({ name: 'A' })).rejects.toMatchObject({ code: 'DATABASE_ERROR' });

    dbMod.__setDb({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    const m = await TestModel.create({ name: 'A' });

    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };
    expect(qb.__getLastBuilder()?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A', created_at: '2025-01-01T00:00:00.000Z' })
    );
    expect(m.getAttribute('created_at')).toBe('2025-01-01T00:00:00.000Z');
    expect(m.getAttribute('updated_at')).toBe('2025-01-01T00:00:00.000Z');

    vi.useRealTimers();
  });

  it('provides a framework-owned primary-key observer for missing model-owned ids', async (): Promise<void> => {
    const TestModel = Model.define({
      ...baseConfig,
      fillable: [...baseConfig.fillable, 'id'],
      casts: {},
      timestamps: false,
      observers: [Model.primaryKey.uuid()],
    });

    expect(Model.primaryKey.isMissing(undefined)).toBe(true);
    expect(Model.primaryKey.isMissing(null)).toBe(true);
    expect(Model.primaryKey.isMissing('')).toBe(true);
    expect(Model.primaryKey.isMissing('   ')).toBe(true);
    expect(Model.primaryKey.isMissing('existing-id')).toBe(false);

    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };

    for (const currentId of [undefined, null, '', '   ']) {
      const model = TestModel.make({ id: currentId, name: 'Generated' });
      await expect(model.save()).resolves.toBe(true);

      const inserted = qb.__getLastBuilder()?.insert.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;

      expect(typeof inserted?.['id']).toBe('string');
      expect(String(inserted?.['id']).trim().length).toBeGreaterThan(0);
      expect(inserted?.['id']).not.toBe(currentId);
    }

    const preserved = TestModel.make({ id: 'already-present', name: 'Preserved' });
    await expect(preserved.save()).resolves.toBe(true);

    const inserted = qb.__getLastBuilder()?.insert.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(inserted?.['id']).toBe('already-present');
  });

  it('top-level create persists and defined new returns an unsaved model', async (): Promise<void> => {
    const config = { ...baseConfig, casts: {}, timestamps: false };
    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };

    const created = await Model.create(config, { name: 'Root' });

    expect(qb.__getLastBuilder()?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Root' })
    );
    expect(created.exists()).toBe(true);

    const TestModel = Model.define(config);
    const draft = TestModel.new({ name: 'Draft' });

    expect(draft.exists()).toBe(false);
    expect(draft.getAttribute('name')).toBe('Draft');
    expect(qb.__getLastBuilder()?.insert).toHaveBeenCalledTimes(1);
  });

  it('top-level make/new stay unsaved and bulk insert proxies to insert', async (): Promise<void> => {
    const config = { ...baseConfig, casts: {}, timestamps: false };
    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };

    const draft = Model.make(config, { name: 'Draft make' });
    const draftAlias = Model.new(config, { name: 'Draft new' });

    expect(draft.exists()).toBe(false);
    expect(draftAlias.exists()).toBe(false);
    expect(draft.getAttribute('name')).toBe('Draft make');
    expect(draftAlias.getAttribute('name')).toBe('Draft new');

    await expect(Model.bulkInsert(config, [{ name: 'A' }, { name: 'B' }])).resolves.toEqual({
      id: 1,
      affectedRows: 1,
    });
    expect(qb.__getLastBuilder()?.insert).toHaveBeenCalledWith([{ name: 'A' }, { name: 'B' }]);
  });

  it('delete returns false when not exists; true when exists and db present', async (): Promise<void> => {
    const TestModel = Model.define({ ...baseConfig, casts: {} });
    const m = TestModel.make({ name: 'A' });

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
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
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
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
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

    const m = Test.make({ name: 'Zin' });
    expect((m as IModel & { greet: (p: string) => string }).greet('hi')).toBe('hi Zin');
  });

  it('define plan function creates bound methods', async (): Promise<void> => {
    const Test = Model.define({ ...baseConfig, casts: {}, timestamps: false }, (m) => ({
      greet: (prefix: string): string => `${prefix} ${String(m.getAttribute('name'))}`,
    }));

    const m = Test.make({ name: 'Plan' });
    expect((m as IModel & { greet: (p: string) => string }).greet('hi')).toBe('hi Plan');
  });

  it('applies mutators on set/fill and accessors on get', async (): Promise<void> => {
    const Test = Model.define({
      ...baseConfig,
      casts: {},
      timestamps: false,
      mutators: {
        name: (value) => String(value).trim().toUpperCase(),
      },
      accessors: {
        name: (value) => `hello ${String(value)}`,
      },
    });

    const m = Test.make({ name: '  zin  ' });
    expect(m.getAttribute('name')).toBe('hello ZIN');

    m.setAttribute('name', '  trust ');
    expect(m.getAttribute('name')).toBe('hello TRUST');
  });

  it('create applies the same mutator, accessor, and observer contract as make plus save', async (): Promise<void> => {
    const creating = vi.fn((model: IModel) => {
      model.setAttribute('slug', 'created-from-observer');
    });

    const Test = Model.define({
      ...baseConfig,
      fillable: ['id', 'name', 'slug', 'active'],
      hidden: [],
      casts: {
        active: 'boolean',
      },
      timestamps: false,
      mutators: {
        name: (value) => String(value).trim().toUpperCase(),
        slug: (value) => `slug:${String(value).trim().toLowerCase()}`,
      },
      accessors: {
        name: (value) => `hello ${String(value)}`,
        slug: (value) => String(value).replace(/^slug:/, ''),
      },
      observers: [{ creating }],
    });

    const created = await Test.create({
      name: '  zintrust  ',
      active: '1',
      ignored: 'nope',
    } as Record<string, unknown>);

    expect(creating).toHaveBeenCalledTimes(1);
    expect(created.getAttributes()).toEqual({
      id: 1,
      name: 'ZINTRUST',
      slug: 'slug:created-from-observer',
      active: true,
    });
    expect(created.getAttribute('name')).toBe('hello ZINTRUST');
    expect(created.getAttribute('slug')).toBe('created-from-observer');
    expect((created as IModel & { slug: string }).slug).toBe('created-from-observer');

    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };
    expect(qb.__getLastBuilder()?.insert).toHaveBeenCalledWith({
      name: 'ZINTRUST',
      slug: 'slug:created-from-observer',
      active: true,
    });
  });

  it('root Model.create matches make plus save for model-owned transforms', async (): Promise<void> => {
    const config: ModelConfig = {
      ...baseConfig,
      table: 'root_models',
      fillable: ['id', 'secret', 'active'],
      hidden: [],
      casts: {
        active: 'boolean',
      },
      timestamps: false,
      mutators: {
        secret: (value) => `enc:${String(value).trim()}`,
      },
      accessors: {
        secret: (value) => String(value).replace(/^enc:/, ''),
      },
    };

    const created = await Model.create(config, { secret: 'abc', active: '1' });
    const manual = Model.make(config, { secret: 'abc', active: '1' });
    await manual.save();

    expect(created.getAttributes()).toEqual(manual.getAttributes());
    expect(created.getAttribute('secret')).toBe('abc');
    expect(manual.getAttribute('secret')).toBe('abc');
    expect(created.getAttribute('active')).toBe(true);
    expect(manual.getAttribute('active')).toBe(true);
  });

  it('hydrate assigns raw stored attributes without re-running mutators', async (): Promise<void> => {
    const Test = Model.define({
      ...baseConfig,
      fillable: ['id', 'secret'],
      hidden: [],
      casts: {},
      timestamps: false,
      mutators: {
        secret: (value) => `enc:${String(value)}`,
      },
      accessors: {
        secret: (value) => String(value).replace(/^enc:/, ''),
      },
    });

    const created = Test.make({ id: 1, secret: 'plain' });
    expect(created.getAttributes()['secret']).toBe('enc:plain');

    const hydrated = Test.hydrate({ id: 1, secret: 'enc:plain' });
    expect(hydrated.getAttributes()['secret']).toBe('enc:plain');
    expect(hydrated.getAttribute('secret')).toBe('plain');
    expect((hydrated as IModel & { secret: string }).secret).toBe('plain');

    (hydrated as IModel & { secret: string }).secret = 'next';
    expect(hydrated.getAttributes()['secret']).toBe('enc:next');
    expect((hydrated as IModel & { secret: string }).secret).toBe('next');
  });

  it('hydrates first() and firstOrFail() results like get()', async (): Promise<void> => {
    const config = {
      ...baseConfig,
      fillable: ['id', 'secret'],
      hidden: [],
      casts: {},
      timestamps: false,
    };
    const builderMod = await import('@orm/QueryBuilder');

    const Test = Model.define(
      {
        ...config,
        mutators: {
          secret: (value) => `enc:${String(value)}`,
        },
        accessors: {
          secret: (value) => String(value).replace(/^enc:/, ''),
        },
      },
      {
        greet: (m: IModel): string => `hi ${String(m.getAttribute('secret'))}`,
      }
    );

    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => ({ id: 2, secret: 'enc:alpha' })),
      firstOrFail: vi.fn(async () => ({ id: 3, secret: 'enc:beta' })),
      get: vi.fn(async () => []),
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
      insert: vi.fn(async () => ({ id: 1, affectedRows: 1 })),
      update: vi.fn(async () => undefined),
    } satisfies MockBuilder);

    const first = await Test.where('id', '=', 2).first<IModel & { greet: () => string }>();
    expect(first).not.toBeNull();
    expect(first?.exists()).toBe(true);
    expect(first?.getAttribute('secret')).toBe('alpha');
    expect((first as IModel & { secret: string }).secret).toBe('alpha');
    expect(first?.greet()).toBe('hi alpha');

    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => null),
      firstOrFail: vi.fn(async () => ({ id: 3, secret: 'enc:beta' })),
      get: vi.fn(async () => []),
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
      insert: vi.fn(async () => ({ id: 1, affectedRows: 1 })),
      update: vi.fn(async () => undefined),
    } satisfies MockBuilder);

    const firstOrFail = await Test.where('id', '=', 3).firstOrFail<
      IModel & { greet: () => string }
    >();
    expect(firstOrFail.exists()).toBe(true);
    expect(firstOrFail.getAttribute('secret')).toBe('beta');
    expect((firstOrFail as IModel & { secret: string }).secret).toBe('beta');
    expect(firstOrFail.greet()).toBe('hi beta');
  });

  it('persists mutated dirty fields on update', async (): Promise<void> => {
    const Test = Model.define({
      ...baseConfig,
      fillable: ['id', 'secret'],
      hidden: [],
      casts: {},
      timestamps: false,
      mutators: {
        secret: (value) => `enc:${String(value)}`,
      },
    });

    const model = Test.hydrate({ id: 9, secret: 'enc:old' });
    model.setAttribute('secret', 'next');

    await expect(model.save()).resolves.toBe(true);

    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };
    expect(qb.__getLastBuilder()?.where).toHaveBeenCalledWith('id', '=', 9);
    expect(qb.__getLastBuilder()?.update).toHaveBeenCalledWith({ secret: 'enc:next' });
  });

  it('runs observer hooks on save and delete', async (): Promise<void> => {
    const saving = vi.fn();
    const creating = vi.fn();
    const created = vi.fn();
    const saved = vi.fn();
    const deleting = vi.fn();
    const deleted = vi.fn();

    const Test = Model.define({
      ...baseConfig,
      casts: {},
      timestamps: false,
      observers: [{ saving, creating, created, saved, deleting, deleted }],
    });

    const m = Test.make({ name: 'A' });

    await m.save();
    expect(saving).toHaveBeenCalledTimes(1);
    expect(creating).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledTimes(1);

    m.setExists(true);
    await m.delete();
    expect(deleting).toHaveBeenCalledTimes(1);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it('supports named query scopes via DefinedModel.scope()', async (): Promise<void> => {
    const qb = (await import('@orm/QueryBuilder')) as unknown as {
      __getLastBuilder: () => MockBuilder | undefined;
    };

    const Test = Model.define({
      ...baseConfig,
      casts: {},
      timestamps: false,
      scopes: {
        active: (builder) => builder.where('active', '=', true),
      },
    });

    Test.scope('active');

    const last = qb.__getLastBuilder();
    expect(last?.where).toHaveBeenCalledWith('active', '=', true);
  });

  it('throws for unknown query scopes', () => {
    const Test = Model.define({
      ...baseConfig,
      casts: {},
      timestamps: false,
      scopes: {},
    });

    expect(() => Test.scope('missing')).toThrow(/Unknown query scope/i);
  });

  it('passes soft delete options to QueryBuilder when softDeletes=true', async () => {
    const builderMod = await import('@orm/QueryBuilder');
    const Test = Model.define({
      ...baseConfig,
      casts: {},
      timestamps: false,
      softDeletes: true,
    });

    Test.query();

    expect(
      (builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }).QueryBuilder
        .create
    ).toHaveBeenCalledWith(
      baseConfig.table,
      expect.anything(),
      expect.objectContaining({ softDeleteColumn: 'deleted_at', softDeleteMode: 'exclude' })
    );
  });

  it('define methods are available on find() and all() results', async (): Promise<void> => {
    const config = { ...baseConfig, casts: {}, timestamps: false };
    const builderMod = await import('@orm/QueryBuilder');

    const Test = Model.define(config, {
      greet: (m: IModel): string => `hi ${String(m.getAttribute('name'))}`,
    });

    // find() path
    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => ({ id: 2, name: 'Found' })),
      get: vi.fn(async () => []),
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
    } satisfies MockBuilder);

    const found = await Test.find(2);
    expect(found).not.toBeNull();
    expect((found as IModel & { greet: () => string }).greet()).toBe('hi Found');

    // all() path
    (
      builderMod as unknown as { QueryBuilder: { create: ReturnType<typeof vi.fn> } }
    ).QueryBuilder.create.mockReturnValueOnce({
      table: config.table,
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      first: vi.fn(async () => null),
      get: vi.fn(async () => [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]),
      paginate: vi.fn(async () => ({
        items: [],
        total: 0,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 0,
        to: 0,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
    } satisfies MockBuilder);

    const allRows = await Test.all();
    expect(allRows).toHaveLength(2);
    expect((allRows[0] as IModel & { greet: () => string }).greet()).toBe('hi A');
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

    const m = Test.make({ id: '5', user_id: '9' });

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

  it('paginate returns hydrated model items', async (): Promise<void> => {
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
      get: vi.fn(async () => []),
      paginate: vi.fn(async () => ({
        items: [{ id: 1, name: 'Paged' }],
        total: 1,
        perPage: 10,
        currentPage: 1,
        lastPage: 1,
        from: 1,
        to: 1,
        links: {},
      })),
      with: vi.fn().mockReturnThis(),
      withCount: vi.fn().mockReturnThis(),
    } satisfies MockBuilder);

    const Test = Model.define(config, {
      greet: (m: IModel): string => `hi ${String(m.getAttribute('name'))}`,
    });

    const paged = await Test.paginate(1, 10);
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0].exists()).toBe(true);
    expect((paged.items[0] as IModel & { greet: () => string }).greet()).toBe('hi Paged');
  });
});
