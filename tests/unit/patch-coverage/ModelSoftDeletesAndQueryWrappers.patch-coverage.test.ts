import { resetDatabase, useDatabase } from '@orm/Database';
import { Model } from '@orm/Model';
import { beforeEach, describe, expect, it } from 'vitest';

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
