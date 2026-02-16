import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import { JobStateTracker } from '@queue/JobStateTracker';

type PersistedJobRow = {
  queue_name: string;
  job_id: string;
  updated_at?: string;
};

const getDb = (): IDatabase =>
  useDatabase(undefined, Env.get('JOB_TRACKING_DB_CONNECTION', 'default'));

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

export const JobReconciliationRunner = Object.freeze({
  async reconcileInMemory(): Promise<{ stalled: number; timeout: number }> {
    const timeoutMs = Math.max(1000, Env.getInt('QUEUE_JOB_TIMEOUT', 60) * 1000);
    const heartbeatGraceMs = Math.max(1000, Env.getInt('JOB_HEARTBEAT_GRACE_MS', 20000));

    const staleHeartbeats = JobStateTracker.listHeartbeatExpired(heartbeatGraceMs);
    await Promise.all(
      staleHeartbeats.map(async (row) =>
        JobStateTracker.stalled({
          queueName: row.queueName,
          jobId: row.jobId,
          reason: 'Missing heartbeat during reconciliation',
        })
      )
    );

    const timedOut = JobStateTracker.listActiveOlderThan(timeoutMs);
    await Promise.all(
      timedOut.map(async (row) =>
        JobStateTracker.timedOut({
          queueName: row.queueName,
          jobId: row.jobId,
          reason: 'Exceeded queue timeout during reconciliation',
        })
      )
    );

    return { stalled: staleHeartbeats.length, timeout: timedOut.length };
  },

  async reconcileFromPersistence(limit = 500): Promise<number> {
    if (!Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) return 0;

    const db = getDb();
    const staleAfterMs = Math.max(1000, Env.getInt('JOB_RECONCILIATION_STALE_MS', 120000));
    const cutoff = new Date(Date.now() - staleAfterMs);

    // Persistence is an enqueue-fallback buffer (jobs that failed to enqueue).
    // Do not reconcile stale 'pending'/'active' from DB: QUEUE_DRIVER is the source of truth.
    // pending_recovery rows are handled by JobRecoveryDaemon, which performs the enqueue attempt.
    const candidates = await db
      .table(Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs'))
      .select('queue_name', 'job_id')
      .whereIn('status', ['pending_recovery'])
      .where('updated_at', '<=', toSqlDateTime(cutoff))
      .limit(Math.max(1, limit))
      .get<PersistedJobRow>();

    return candidates.length;
  },

  async runOnce(): Promise<{ inMemory: { stalled: number; timeout: number }; persisted: number }> {
    const inMemory = await this.reconcileInMemory();
    const persisted = await this.reconcileFromPersistence();

    if (inMemory.stalled > 0 || inMemory.timeout > 0 || persisted > 0) {
      Logger.warn('Queue reconciliation updated jobs', {
        stalled: inMemory.stalled,
        timeout: inMemory.timeout,
        persisted,
      });
    }

    return { inMemory, persisted };
  },
});

export default JobReconciliationRunner;
