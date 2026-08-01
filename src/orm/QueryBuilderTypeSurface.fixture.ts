/**
 * Compile-time type surface fixture for QueryBuilder / DefinedModel.
 *
 * This file is included in the core type-check graph so regressions such as
 * “DefinedModel.join only accepts string” or missing whereNotNull / latestPer
 * fail `npm run type-check` instead of only showing up in downstream apps.
 *
 * Not intended for runtime use.
 */

import type { DefinedModel, IModel } from '@orm/Model';
import type {
  IJoinOnBuilder,
  IQueryBuilder,
  JoinOnInput,
  LatestPerOptions,
} from '@orm/QueryBuilder';

type EmptyMethods = Record<string, never>;

/** Ensures a value is assignable to IQueryBuilder (compile-time only). */
const asBuilder = (value: IQueryBuilder): IQueryBuilder => value;

/**
 * Full builder chain required by product patterns (inbox, anti-join, groupBy).
 */
export const assertIQueryBuilderSurface = (qb: IQueryBuilder): IQueryBuilder => {
  const latestOptions = {
    orderBy: [
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ],
  } as const satisfies LatestPerOptions;

  const joinOn: JoinOnInput = (on: IJoinOnBuilder) =>
    on.on('messages.id', '=', 'states.message_id').on('states.thread_id', '=', 'messages.thread_id');

  return asBuilder(
    qb
      .whereNotNull('hidden_at')
      .whereColumn('messages.thread_id', '=', 'threads.id')
      .whereExists((sub) =>
        sub
          .from('message_user_states')
          .whereColumn('message_user_states.message_id', '=', 'messages.id')
          .where('user_id', '=', 1)
      )
      .whereNotExists((sub) =>
        sub
          .from('message_user_states')
          .whereColumn('message_user_states.message_id', '=', 'messages.id')
          .whereNotNull('hidden_at')
      )
      .join('states', joinOn)
      .join(
        'other',
        'messages.id = other.message_id AND messages.thread_id = other.thread_id'
      )
      .leftJoin('profiles', (on) => on.on('profiles.user_id', '=', 'users.id'))
      .groupBy('thread_id')
      .latestPer('thread_id', latestOptions)
      .latestPer(['tenant_id', 'user_id'], { orderBy: [['id', 'ASC']], alias: 'rn' })
  );
};

/**
 * Static Model helpers must expose the same surface so chains like
 * `Message.where(...).whereNotExists(...).latestPer(...)` type-check without casts.
 */
export const assertDefinedModelStaticSurface = (
  model: DefinedModel<EmptyMethods>
): IQueryBuilder => {
  const fromStatic = asBuilder(
    model
      .whereNotNull('deleted_for_all_at')
      .whereColumn('messages.id', '=', 'states.message_id')
      .whereNotExists((sub) =>
        sub
          .from('message_user_states')
          .whereColumn('message_user_states.message_id', '=', 'messages.id')
          .where('user_id', '=', 42)
          .whereNotNull('hidden_at')
      )
      .join('messages', (on) =>
        on
          .on('messages.id', '=', 'message_user_states.message_id')
          .on('message_user_states.thread_id', '=', 'messages.thread_id')
      )
      .groupBy('thread_id')
      .latestPer('thread_id', {
        orderBy: [
          ['created_at', 'DESC'],
          ['id', 'DESC'],
        ],
      })
  );

  const fromQuery = asBuilder(
    model
      .query()
      .latestPer('thread_id', { orderBy: [['created_at', 'DESC']] })
      .whereNotExists((sub) =>
        sub.from('message_user_states').whereColumn('message_user_states.message_id', '=', 'messages.id')
      )
      .groupBy('thread_id')
  );

  // Keep both chains “used” for the type checker without runtime preference.
  return model.getTable().length > 0 ? fromStatic : fromQuery;
};

/** Re-export anchors so package entry re-exports stay linked to this fixture graph. */
export type QueryBuilderSurfaceTypes = {
  builder: IQueryBuilder;
  joinOn: JoinOnInput;
  joinOnBuilder: IJoinOnBuilder;
  latestPer: LatestPerOptions;
  model: DefinedModel<EmptyMethods>;
  instance: IModel;
};
