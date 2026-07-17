import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabase } from '@orm/Database';
import { Model } from '@orm/Model';
import {
  assertDefinedModelStaticSurface,
  assertIQueryBuilderSurface,
} from '@orm/QueryBuilderTypeSurface.fixture';
import { QueryBuilder } from '@orm/QueryBuilder';

vi.mock('@orm/Database', () => {
  const fakeDb = {
    getType: () => 'sqlite',
    query: vi.fn(async () => []),
  };
  return {
    useDatabase: vi.fn(() => fakeDb),
    __fakeDb: fakeDb,
  };
});

/**
 * Runtime smoke + compile-time fixture import.
 * The fixture file is the real type gate; this test ensures static Model
 * helpers are wired at runtime and that the fixture stays importable.
 */
describe('QueryBuilder type surface (DefinedModel + IQueryBuilder)', () => {
  const Message = Model.define({
    table: 'messages',
    fillable: [],
    hidden: [],
    timestamps: false,
    casts: {},
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes advanced helpers on Model.query() and static chain', () => {
    const viaQuery = Message.query()
      .whereNotNull('deleted_for_all_at')
      .whereColumn('messages.id', '=', 'states.message_id')
      .whereNotExists((sub) =>
        sub
          .from('message_user_states')
          .whereColumn('message_user_states.message_id', '=', 'messages.id')
          .where('user_id', '=', 1)
          .whereNotNull('hidden_at')
      )
      .join('states', (on) =>
        on
          .on('states.message_id', '=', 'messages.id')
          .on('states.thread_id', '=', 'messages.thread_id')
      )
      .latestPer('thread_id', {
        orderBy: [
          ['created_at', 'DESC'],
          ['id', 'DESC'],
        ],
      });

    const querySql = viaQuery.toSQL();
    expect(querySql).toContain('NOT EXISTS');
    expect(querySql).toContain('ROW_NUMBER()');
    expect(querySql).toContain('INNER JOIN "states"');

    const grouped = Message.query()
      .select('thread_id', 'COUNT(*) AS total')
      .groupBy('thread_id');
    expect(grouped.toSQL()).toContain('GROUP BY "thread_id"');
  });

  it('covers every new DefinedModel static wrapper end-to-end', () => {
    // Each line must call the static helper on the model (not only builder methods),
    // so patch coverage for createQueryBuilderMethods hits every new wrapper.
    expect(Message.whereNull('deleted_for_all_at').toSQL()).toContain('IS NULL');
    expect(Message.whereNotNull('read_at').toSQL()).toContain('IS NOT NULL');
    expect(
      Message.whereColumn('messages.thread_id', '=', 'threads.id').toSQL()
    ).toContain('"messages"."thread_id" = "threads"."id"');

    expect(
      Message.whereExists((sub) =>
        sub.from('posts').whereColumn('posts.user_id', '=', 'messages.user_id')
      ).toSQL()
    ).toContain('EXISTS (SELECT 1 FROM "posts"');

    expect(
      Message.whereNotExists((sub) =>
        sub
          .from('message_user_states')
          .whereColumn('message_user_states.message_id', '=', 'messages.id')
      ).toSQL()
    ).toContain('NOT EXISTS');

    // Static from() rewrites the primary table on a fresh builder.
    expect(Message.from('message_user_states').getTable()).toBe('message_user_states');

    expect(
      Message.join('states', (on) =>
        on
          .on('states.message_id', '=', 'messages.id')
          .on('states.thread_id', '=', 'messages.thread_id')
      ).toSQL()
    ).toContain('INNER JOIN "states"');

    expect(
      Message.leftJoin('profiles', 'messages.user_id = profiles.user_id').toSQL()
    ).toContain('LEFT JOIN "profiles"');

    // Call static groupBy / latestPer directly (not only chained after select()).
    expect(Message.groupBy('thread_id').toSQL()).toContain('GROUP BY "thread_id"');
    expect(
      Message.select('thread_id', 'COUNT(*) AS total').groupBy('thread_id').toSQL()
    ).toContain('GROUP BY "thread_id"');

    expect(
      Message.latestPer('thread_id', {
        orderBy: [
          ['created_at', 'DESC'],
          ['id', 'DESC'],
        ],
      }).toSQL()
    ).toContain('ROW_NUMBER()');
  });

  it('keeps compile-time fixture assignable against live builders', () => {
    const qb = QueryBuilder.create('messages', {
      getType: () => 'sqlite',
      query: vi.fn(async () => []),
    } as unknown as IDatabase);
    expect(typeof assertIQueryBuilderSurface(qb).toSQL).toBe('function');
    expect(typeof assertDefinedModelStaticSurface(Message).toSQL).toBe('function');
  });
});
