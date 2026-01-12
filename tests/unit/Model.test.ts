import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createModel, define, Model } from '../../src/orm/Model';
import { QueryBuilder } from '../../src/orm/QueryBuilder';

vi.mock('../../src/orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(),
  },
}));

// Prevent useDatabase from requiring an initialized DB connection in tests
vi.mock('../../src/orm/Database', () => ({
  useDatabase: vi.fn().mockReturnValue({}),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Model - dirty fields and attributes', () => {
  it('marks fields dirty on fill and removes when set back to original', async () => {
    const cfg = {
      table: 'users',
      fillable: ['name'],
      hidden: [],
      casts: {},
      timestamps: false,
    } as any;

    // initial model with name 'alice'
    const model = createModel(cfg, { name: 'alice' });
    model.setExists(true);

    // change to a different value
    model.setAttribute('name', 'bob');
    expect(model.isDirty('name')).toBe(true);

    // set it back to original
    model.setAttribute('name', 'alice');
    expect(model.isDirty('name')).toBe(false);
    expect(model.isDirty()).toBe(false);
  });
});

describe('Model - raw and query wrapping', () => {
  it('raw() returns builder.get()', async () => {
    const cfg = {
      table: 'users',
      fillable: [],
      hidden: [],
      casts: {},
      timestamps: false,
    } as any;

    // Mock QueryBuilder.create to return builder with get()
    const fakeGet = vi.fn().mockResolvedValue([{ id: 1 }]);
    (QueryBuilder.create as unknown as Mock).mockReturnValue({ get: fakeGet });

    const defined = Model.define(cfg as any);
    const raw = await defined.raw();
    expect(raw).toEqual([{ id: 1 }]);
    expect(fakeGet).toHaveBeenCalled();
  });

  it('wraps get() to handle non-array return unchanged', async () => {
    const cfg = {
      table: 'users',
      fillable: [],
      hidden: [],
      casts: {},
      timestamps: false,
    } as any;

    const notArrayGet = vi.fn().mockResolvedValue({ ok: true });
    (QueryBuilder.create as unknown as Mock).mockReturnValue({ get: notArrayGet });

    const defined = Model.define(cfg as any);
    const builder = defined.query();
    // builder.get should return the same non-array result
    const r = await builder.get();
    expect(r).toEqual({ ok: true });
  });

  it('calls eager load functions when eagerLoads present', async () => {
    const cfg = {
      table: 'users',
      fillable: [],
      hidden: [],
      casts: {},
      timestamps: false,
    } as any;

    const rows = [{ id: 2 }];
    const fakeGet = vi.fn().mockResolvedValue(rows);
    const getEagerLoads = vi.fn().mockReturnValue(['projects']);
    const load = vi.fn().mockResolvedValue(undefined);

    (QueryBuilder.create as unknown as Mock).mockReturnValue({
      get: fakeGet,
      getEagerLoads,
      load,
    });

    // Create a simple relation that the hydrator can use
    const plan = (_m: any) => ({
      projects: () => ({
        type: 'hasMany',
        get: () => undefined,
        related: { hydrate: (a: any) => createModel(cfg, a) },
      }),
    });

    const defined = define(cfg as any, plan as any);
    const builder = defined.query();
    const result = await builder.get();

    expect(Array.isArray(result)).toBe(true);
    expect((result as any)[0].getAttribute('id')).toBe(2);
    expect(load).toHaveBeenCalled();
  });
});

describe('Model - hydrateWithRelations', () => {
  it('hydrates related arrays and single objects', () => {
    const cfg = {
      table: 'users',
      fillable: ['id'],
      hidden: [],
      casts: {},
      timestamps: false,
    } as any;

    const plan = (_m: any) => ({
      projectList: () => ({
        type: 'hasMany',
        get: () => undefined,
        related: { hydrate: (a: any) => createModel(cfg, a) },
      }),
      owner: () => ({
        type: 'hasOne',
        get: () => undefined,
        related: { hydrate: (a: any) => createModel(cfg, a) },
      }),
    });

    const defined = define(cfg as any, plan as any);

    const m = defined.hydrateWithRelations(
      { id: 1 },
      { projectList: [{ id: 3 }, 4], owner: { id: 9 } }
    );
    const projects = m.getRelation('projectList') as any[];
    const owner = m.getRelation('owner') as any;

    expect(Array.isArray(projects)).toBe(true);
    expect(projects[0].getAttribute('id')).toBe(3);
    expect(owner.getAttribute('id')).toBe(9);
  });
});
