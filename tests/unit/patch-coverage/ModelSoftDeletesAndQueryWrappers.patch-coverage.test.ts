import { resetDatabase, useDatabase } from '@orm/Database';
import { Model } from '@orm/Model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('patch coverage: Model soft deletes + query wrappers', () => {
  const config = {
    table: 'users',
    fillable: ['id', 'deleted_at'],
    hidden: [],
    timestamps: false,
    casts: {},
    softDeletes: true,
    deleteAtColumn: 'deleted_at',
  };

  beforeEach(async () => {
    await resetDatabase();
    useDatabase({ driver: 'sqlite', database: ':memory:' }, 'default');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & {
      __zintrust_trace_model_emit__?: ReturnType<typeof vi.fn>;
    }).__zintrust_trace_model_emit__;
  });

  it('restore() and isDeleted() behave for soft delete models', async () => {
    const m = Model.create(config, { id: 1, deleted_at: '2024-01-01T00:00:00.000Z' });

    // Not persisted yet
    expect(await m.restore()).toBe(false);
    expect(await m.forceDelete()).toBe(false);

    m.setExists(true);

    expect(m.isDeleted()).toBe(true);
    expect(await m.restore()).toBe(true);
    expect(m.isDirty('deleted_at')).toBe(true);
    expect(m.isDeleted()).toBe(false);
  });

  it('forceDelete() runs observers when model exists', async () => {
    const calls: string[] = [];

    const cfg = {
      ...config,
      observers: [
        {
          deleting: async () => {
            calls.push('deleting');
          },
          deleted: async () => {
            calls.push('deleted');
          },
        },
      ],
    };

    const m = Model.create(cfg, { id: 1 });
    m.setExists(true);

    expect(await m.forceDelete()).toBe(true);
    expect(calls).toEqual(['deleting', 'deleted']);
  });

  it('emits traced model changes on update save', async () => {
    const emit = vi.fn();
    (globalThis as typeof globalThis & {
      __zintrust_trace_model_emit__?: typeof emit;
    }).__zintrust_trace_model_emit__ = emit;
    await useDatabase().query(
      'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)',
      []
    );
    await useDatabase().query('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);

    const m = Model.create(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      { id: 1, name: 'Alice' }
    );
    m.setExists(true);
    m.setAttribute('name', 'Bob');

    expect(await m.save()).toBe(true);
    expect(emit).toHaveBeenCalledWith('update', 'users', 1, { name: 'Bob' });
  });

  it('emits traced model delete events without change payloads on forceDelete', async () => {
    const emit = vi.fn();
    (globalThis as typeof globalThis & {
      __zintrust_trace_model_emit__?: typeof emit;
    }).__zintrust_trace_model_emit__ = emit;

    const m = Model.create(config, { id: 7 });
    m.setExists(true);

    expect(await m.forceDelete()).toBe(true);
    expect(emit).toHaveBeenCalledWith('delete', 'users', 7, undefined);
  });

  it('covers defined model query builder wrapper methods', () => {
    const Users = Model.define(config, {});

    // These should be safe to call without executing DB.
    expect(Users.where('id', '=', 1)).toBeDefined();
    expect(Users.andWhere('id', '=', 1)).toBeDefined();
    expect(Users.orWhere('id', '=', 1)).toBeDefined();
    expect(Users.whereIn('id', [1, 2, 3])).toBeDefined();
    expect(Users.whereNotIn('id', [1, 2, 3])).toBeDefined();
  });
});
