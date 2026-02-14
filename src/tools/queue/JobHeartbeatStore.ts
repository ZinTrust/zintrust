import { Env } from '@config/env';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';

const HEARTBEAT_TABLE = 'zintrust_job_heartbeats';

const getConnection = (): IDatabase =>
  useDatabase(undefined, Env.get('JOB_TRACKING_DB_CONNECTION', 'default'));

const now = (): Date => new Date();

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

export const JobHeartbeatStore = Object.freeze({
  getIntervalMs(): number {
    return Math.max(1000, Env.getInt('JOB_HEARTBEAT_INTERVAL_MS', 10000));
  },

  async heartbeat(input: {
    queueName: string;
    jobId: string;
    workerInstanceId?: string;
    intervalMs?: number;
  }): Promise<void> {
    if (!Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) return;

    const db = getConnection();
    const intervalMs = input.intervalMs ?? this.getIntervalMs();
    const current = now();
    const expected = new Date(current.getTime() + intervalMs * 2);

    const payload = {
      queue_name: input.queueName,
      job_id: input.jobId,
      worker_instance_id: input.workerInstanceId ?? null,
      heartbeat_interval_ms: intervalMs,
      last_heartbeat_at: toSqlDateTime(current),
      expected_next_heartbeat_at: toSqlDateTime(expected),
      updated_at: toSqlDateTime(current),
    };

    const existing = await db
      .table(HEARTBEAT_TABLE)
      .where('queue_name', '=', input.queueName)
      .where('job_id', '=', input.jobId)
      .first<{ id: number }>();

    if (existing !== null && existing !== undefined) {
      await db.table(HEARTBEAT_TABLE).where('id', '=', existing.id).update(payload);
      return;
    }

    await db.table(HEARTBEAT_TABLE).insert({
      ...payload,
      created_at: toSqlDateTime(current),
    });
  },

  async remove(queueName: string, jobId: string): Promise<void> {
    if (!Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) return;
    const db = getConnection();
    await db
      .table(HEARTBEAT_TABLE)
      .where('queue_name', '=', queueName)
      .where('job_id', '=', jobId)
      .delete();
  },

  async listExpired(limit = 500): Promise<Array<{ queueName: string; jobId: string }>> {
    if (!Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) return [];

    const db = getConnection();
    const rows = await db
      .table(HEARTBEAT_TABLE)
      .select('queue_name', 'job_id')
      .where('expected_next_heartbeat_at', '<=', toSqlDateTime(now()))
      .limit(Math.max(1, limit))
      .get<{ queue_name: string; job_id: string }>();

    return (rows ?? []).map((row) => ({
      queueName: row.queue_name,
      jobId: row.job_id,
    }));
  },
});

export default JobHeartbeatStore;
