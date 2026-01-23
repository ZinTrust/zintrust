import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import type { QueueMessage } from '@tools/queue/Queue';

export interface DatabaseQueueConfig {
  connection?: string;
  table?: string;
  retryAttempts?: number;
  visibilityTimeout?: number;
}

export interface IDatabaseQueueDriver {
  enqueue<T = unknown>(queue: string, payload: T, connectionName?: string): Promise<string>;
  dequeue<T = unknown>(
    queue: string,
    connectionName?: string
  ): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string, connectionName?: string): Promise<void>;
  length(queue: string, connectionName?: string): Promise<number>;
  drain(queue: string, connectionName?: string): Promise<void>;
}

export const DatabaseQueue = (() => {
  const connections = new Map<string, IDatabase>();

  const getConnection = (connectionName?: string): IDatabase => {
    const name = connectionName ?? Env.get('DB_CONNECTION', 'default');
    if (!connections.has(name)) {
      connections.set(name, useDatabase(undefined, name));
    }
    const connection = connections.get(name);
    if (!connection) {
      throw ErrorFactory.createConfigError(`Database connection '${name}' not found`);
    }
    return connection;
  };

  const getTableName = (): string => Env.get('QUEUE_DB_TABLE', 'queue_jobs');

  return {
    async enqueue<T = unknown>(
      queue: string,
      payload: T,
      connectionName?: string
    ): Promise<string> {
      const db = getConnection(connectionName);
      const tableName = getTableName();

      const result = await QueryBuilder.create(tableName, db).insert({
        queue,
        payload: JSON.stringify(payload),
        attempts: 0,
        max_attempts: Env.getInt('QUEUE_DB_RETRY_ATTEMPTS', 3),
        created_at: new Date(),
        available_at: new Date(),
      });

      const jobId = result.id as string;
      Logger.info(`[DatabaseQueue] Job enqueued: ${jobId} to queue: ${queue}`);
      return jobId;
    },

    async dequeue<T = unknown>(
      queue: string,
      connectionName?: string
    ): Promise<QueueMessage<T> | undefined> {
      const db = getConnection(connectionName);
      const tableName = getTableName();
      const visibilityTimeout = Env.getInt('QUEUE_DB_VISIBILITY_TIMEOUT', 30);
      const timeoutDate = new Date(Date.now() - visibilityTimeout * 1000);

      // Try to reserve a job using atomic update
      const result = await db.transaction(async (trx: IDatabase) => {
        const job = await QueryBuilder.create(tableName, trx)
          .select('id', 'payload', 'attempts', 'max_attempts')
          .where('queue', '=', queue)
          .where('available_at', '<=', new Date())
          .where('reserved_at', '=', null)
          .orWhere('reserved_at', '<=', timeoutDate)
          .where('failed_at', '=', null)
          .orderBy('available_at', 'ASC')
          .limit(1)
          .first<{ id: string; payload: string; attempts: number; max_attempts: number }>();

        if (!job) return null;

        // Check if job has exceeded max attempts
        if (job.attempts >= job.max_attempts) {
          // Move to dead letter queue
          await QueryBuilder.create('queue_jobs_failed', trx).insert({
            original_id: job.id,
            queue,
            payload: job.payload,
            attempts: job.attempts,
            failed_at: new Date(),
            error_message: 'Max attempts exceeded',
          });

          // Remove from active queue
          await QueryBuilder.create(tableName, trx).where('id', '=', job.id).delete();

          Logger.warn(
            `[DatabaseQueue] Job ${job.id} exceeded max attempts (${job.max_attempts}), moved to dead letter queue`
          );
          return null;
        }

        // Calculate exponential backoff delay
        const backoffDelay = Math.min(Math.pow(2, job.attempts) * 1000, 30000); // Max 30 seconds
        const nextAvailableAt = new Date(Date.now() + backoffDelay);

        // Reserve the job and set next available time
        await QueryBuilder.create(tableName, trx)
          .where('id', '=', job.id)
          .update({
            reserved_at: new Date(),
            attempts: job.attempts + 1,
            available_at: nextAvailableAt,
          });

        Logger.debug(
          `[DatabaseQueue] Job ${job.id} reserved, attempt ${job.attempts + 1}/${job.max_attempts}, next available at ${nextAvailableAt.toISOString()}`
        );
        return job;
      });

      if (!result) return undefined;

      return {
        id: result.id,
        payload: JSON.parse(result.payload) as T,
        attempts: result.attempts,
      };
    },

    async ack(queue: string, id: string, connectionName?: string): Promise<void> {
      const db = getConnection(connectionName);
      const tableName = getTableName();

      await QueryBuilder.create(tableName, db)
        .where('id', '=', id)
        .where('queue', '=', queue)
        .delete();

      Logger.debug(`[DatabaseQueue] Job acknowledged: ${id} from queue: ${queue}`);
    },

    async length(queue: string, connectionName?: string): Promise<number> {
      const db = getConnection(connectionName);
      const tableName = getTableName();

      const result = await QueryBuilder.create(tableName, db)
        .select('id')
        .where('queue', '=', queue)
        .where('available_at', '<=', new Date())
        .where('reserved_at', '=', null)
        .orWhere(
          'reserved_at',
          '<=',
          new Date(Date.now() - Env.getInt('QUEUE_DB_VISIBILITY_TIMEOUT', 30) * 1000)
        )
        .where('failed_at', '=', null)
        .get<{ id: string }>();

      return result?.length ?? 0;
    },

    async drain(queue: string, connectionName?: string): Promise<void> {
      const db = getConnection(connectionName);
      const tableName = getTableName();

      await QueryBuilder.create(tableName, db).where('queue', '=', queue).delete();

      Logger.info(`[DatabaseQueue] Queue drained: ${queue}`);
    },
  } as const;
})();

export default DatabaseQueue;
