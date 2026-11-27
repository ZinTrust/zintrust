/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  firstResult: null as unknown,
  getResult: [] as unknown,
  paginateResult: { items: [] as unknown, total: 0 } as any,
}));

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => ({})),
  resetDatabase: vi.fn(),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(() => {
      const builder: any = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn(async () => shared.firstResult),
        firstOrFail: vi.fn(async () => shared.firstResult),
        get: vi.fn(async () => shared.getResult),
        paginate: vi.fn(async () => shared.paginateResult),
        with: vi.fn().mockReturnThis(),
        withCount: vi.fn().mockReturnThis(),
        count: vi.fn(async () => 0),
        insert: vi.fn(async () => ({ id: 1, affectedRows: 1 })),
        update: vi.fn(async () => 1),
      };
      return builder;
    }),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { Logger } from '@config/logger';
import { Model, type ModelConfig } from '@orm/Model';

const base = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
  table: 'items',
  fillable: ['id', 'name', 'meta', 'born', 'unknown_cast', 'deleted_at'],
  hidden: [],
  timestamps: false,
  ...overrides,
});

describe('Model uncovered branches (final-orm)', () => {
  const previousEmit = (globalThis as any).__zintrust_trace_model_emit__;

  beforeEach(() => {
    shared.firstResult = null;
    shared.getResult = [];
    shared.paginateResult = { items: [], total: 0 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['ZINTRUST_DEBUG_RELATIONS'];
    (globalThis as any).__zintrust_trace_model_emit__ = previousEmit;
    delete (globalThis as any).__zintrust_trace_model_emit__;
  });

  it('handles missing casts, unknown cast types and non-string JSON values', () => {
    const plain = Model.define(base());
    expect(plain.make({ name: 'x' }).getAttribute('name')).toBe('x');

    const unknown = Model.define(base({ casts: { unknown_cast: 'mystery' } }));
    expect(unknown.make({ unknown_cast: 'raw' }).getAttribute('unknown_cast')).toBe('raw');

    const json = Model.define(base({ casts: { meta: 'json' } }));
    expect(json.make({ meta: { a: 1 } }).getAttribute('meta')).toEqual({ a: 1 });
  });

  it('serializes Date attributes through toJSON', () => {
    const M = Model.define(base());
    const model = M.make({ born: new Date('2025-01-02T03:04:05.000Z') });
    expect(model.toJSON()['born']).toBe('2025-01-02T03:04:05.000Z');
  });

  it('applies save timestamps only for creates when configured', async () => {
    const WithTimestamps = Model.define(base({ timestamps: true }));

    const created = WithTimestamps.make({ name: 'new' });
    await created.save();
    expect(created.getAttribute('created_at')).toBeDefined();

    const existing = WithTimestamps.hydrate({ id: 1, name: 'old' });
    existing.fill({ name: 'updated' });
    await existing.save();
    expect(existing.getAttribute('updated_at')).toBeDefined();
  });

  it('treats absent timestamp configuration as disabled', async () => {
    const M = Model.define(base({ timestamps: undefined }));

    const created = M.make({ name: 'created' });
    await expect(created.save()).resolves.toBe(true);
    expect(created.getAttribute('updated_at')).toBeUndefined();

    const existing = M.hydrate({ id: 1, name: 'old' });
    existing.fill({ name: 'new' });
    await expect(existing.save()).resolves.toBe(true);
  });

  it('emits trace events with an undefined id when the id is not a primitive', async () => {
    const emit = vi.fn();
    (globalThis as any).__zintrust_trace_model_emit__ = emit;

    const M = Model.define(base({ timestamps: true }));
    await M.make({ id: { nested: true }, name: 'trace' }).save();

    expect(emit).toHaveBeenCalledWith('create', 'items', undefined, undefined);
  });

  it('supports primary key observer defaults, disabled mode, and blank generated keys', async () => {
    const observerWithDefaults = Model.primaryKey.using({ generate: () => 'generated' });
    const DefaultKey = Model.define(base(), { id: (m: any) => observerWithDefaults.creating!(m) });
    const defaultModel = DefaultKey.make({});
    observerWithDefaults.creating!(defaultModel);
    expect(defaultModel.getAttribute('id')).toBe('generated');

    const disabled = Model.primaryKey.using({ whenMissing: false, generate: () => 'nope' });
    const disabledModel = DefaultKey.make({});
    expect(() => disabled.creating!(disabledModel)).not.toThrow();
    expect(disabledModel.getAttribute('id')).toBeUndefined();

    const blank = Model.primaryKey.using({ generate: () => '   ' });
    expect(() => blank.creating!(DefaultKey.make({}))).toThrow(/missing or blank/i);
  });

  it('normalizes uuid primary key strategy without explicit observers', () => {
    const M = Model.define(base({ primaryKey: { strategy: 'uuid' } }));
    const model = M.make({});
    expect(model).toBeDefined();
  });

  it('skips updates with no dirty values and rejects updates without an id', async () => {
    const M = Model.define(base());

    await expect(M.hydrate({ id: 1, name: 'same' }).save()).resolves.toBe(true);
    await expect(M.hydrate({ name: 'no-id' }).fill({ name: 'changed' }).save()).rejects.toThrow(
      /without an id/i
    );
  });

  it('fills changed attributes, returns stored relations and exposes readable relation properties', () => {
    const M = Model.define(base());
    const model = M.make({ name: 'before' });
    model.fill({ name: 'after' });
    expect(model.getAttribute('name')).toBe('after');

    model.setRelation('related', 42);
    expect(model.getAttribute('related')).toBe(42);
    expect((model as any).related).toBe(42);
    (model as any).related = 84;
    expect(model.getRelation('related')).toBe(84);
  });

  it('handles soft delete defaults for restore and isDeleted', async () => {
    const Soft = Model.define(base({ softDeletes: true }));
    const model = Soft.hydrate({ id: 1 });
    expect(model.isDeleted()).toBe(false);
    await expect(model.restore()).resolves.toBe(true);
    expect(model.getAttribute('deleted_at')).toBeNull();

    expect(Model.define(base({ softDeletes: false })).make({}).isDeleted()).toBe(false);
  });

  it('logs resolved and throwing relation probes in debug mode', () => {
    process.env['ZINTRUST_DEBUG_RELATIONS'] = '1';
    const Related = {
      query: () => ({}),
      getTable: () => 'related',
    } as any;

    Model.define(
      base(),
      (model: any) => ({
        valid: () => model.belongsTo(Related),
        broken: () => {
          throw new Error('broken relation probe');
        },
      })
    );

    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Relation bootstrap resolved relationship items.valid')
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Relation bootstrap probe threw for items.broken'),
      expect.anything()
    );
  });

  it('returns non-array paginate results unchanged and null from find', async () => {
    const M = Model.define(base({ timestamps: true }));
    shared.paginateResult = { items: null, total: 0 };
    await expect(M.paginate(1, 10)).resolves.toEqual(shared.paginateResult);

    shared.firstResult = null;
    await expect(M.find(999)).resolves.toBeNull();
  });

  it('skips unknown relations, relations without hydrate, and non-record relation data', () => {
    const relatedWithHydrate = {
      hydrate: (attributes: Record<string, unknown>) => attributes,
      query: () => ({}),
    } as any;
    const relatedWithoutHydrate = { query: () => ({}) } as any;

    const M = Model.define(
      base(),
      () => ({
        withHydrate: () => ({ type: 'belongsTo', get: () => undefined, related: relatedWithHydrate }),
        withoutHydrate: () => ({
          type: 'belongsTo',
          get: () => undefined,
          related: relatedWithoutHydrate,
        }),
      })
    );

    const model = M.hydrateWithRelations(
      { id: 1 },
      {
        unknownRelation: { id: 2 },
        withoutHydrate: { id: 3 },
        withHydrate: null,
      }
    );

    expect(model.getRelation('unknownRelation')).toBeUndefined();
    expect(model.getRelation('withoutHydrate')).toBeUndefined();
    expect(model.getRelation('withHydrate')).toBeUndefined();
  });

  it('rejects non-object hydration inputs', () => {
    const M = Model.define(base());
    expect(M.hydrate('not-a-model' as any)).toBeDefined();
  });
});
