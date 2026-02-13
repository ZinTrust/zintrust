import { Env } from '@config/env';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import { Queue, type BullMQPayload } from '@queue/Queue';

const getDb = (): IDatabase =>
  useDatabase(undefined, Env.get('JOB_TRACKING_DB_CONNECTION', 'default'));

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

export const IdempotencyManager = Object.freeze({
  async enqueueIdempotent(
    queueName: string,
    payload: BullMQPayload,
    idempotencyKey: string,
    ttlMs = Env.getInt('IDEMPOTENCY_DEFAULT_TTL_MS', 86400000)
  ): Promise<string> {
    const key = idempotencyKey.trim();
    if (key === '') {
      return Queue.enqueue(queueName, payload);
    }

    if (Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) {
      const db = getDb();
      const cutoff = new Date(Date.now() - Math.max(1000, ttlMs));
      const row = await db
        .table(Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs'))
        .select('job_id', 'status')
        .where('idempotency_key', '=', key)
        .where('created_at', '>=', toSqlDateTime(cutoff))
        .whereIn('status', ['pending', 'active', 'completed'])
        .first<{ job_id: string }>();

      if (row?.job_id !== undefined) return row.job_id;
    }

    return Queue.enqueue(queueName, {
      ...payload,
      uniqueId: key,
      deduplication: {
        id: key,
        ttl: ttlMs,
      },
      __zintrustIdempotencyKey: key,
    });
  },
});

export default IdempotencyManager;
