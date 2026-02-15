import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import type { JobTrackingStatus } from '@queue/JobStateTracker';
import { JobStateTracker } from '@queue/JobStateTracker';

type PersistedJobRow = {
  queue_name: string;
  job_id: string;
  status: JobTrackingStatus;
  attempts?: number;
  max_attempts?: number;
  retry_at?: string | null;
  updated_at?: string;
};

const getDb = (): IDatabase =>
  useDatabase(undefined, Env.get('JOB_TRACKING_DB_CONNECTION', 'default'));

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

const mapPersistedStatus = (raw: unknown): JobTrackingStatus | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  const allowed: JobTrackingStatus[] = [
    'pending',
    'active',
    'completed',
    'failed',
    'stalled',
    'timeout',
    'pending_recovery',
    'dead_letter',
    'manual_review',
    'delayed',
  ];
  return allowed.find((entry) => entry === value) ?? null;
};

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

    const rows = await db
      .table(Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs'))
      .select(
        'queue_name',
        'job_id',
        'status',
        'attempts',
        'max_attempts',
        'retry_at',
        'updated_at'
      )
      .whereIn('status', ['active', 'pending'])
      .where('updated_at', '<=', toSqlDateTime(cutoff))
      .limit(Math.max(1, limit))
      .get<PersistedJobRow>();

    const actionableRows = (rows ?? []).filter((row) => mapPersistedStatus(row.status) !== null);

    await Promise.all(
      actionableRows.map(async (row) => {
        const status = mapPersistedStatus(row.status);
        if (status === 'active') {
          await JobStateTracker.stalled({
            queueName: row.queue_name,
            jobId: row.job_id,
            reason: 'Persisted active job stale during reconciliation',
          });
          return;
        }

        // Pending jobs can be legitimately waiting for their retry window.
        // Avoid creating churn transitions until the retry_at window has passed.
        if (status === 'pending' && typeof row.retry_at === 'string' && row.retry_at.trim()) {
          const retryAtMs = new Date(row.retry_at).getTime();
          if (!Number.isNaN(retryAtMs) && retryAtMs > Date.now()) {
            return;
          }
        }

        const persistedAttempts =
          typeof row.attempts === 'number' && Number.isFinite(row.attempts)
            ? Math.max(0, Math.floor(row.attempts))
            : 0;
        const maxAttempts =
          typeof row.max_attempts === 'number' && Number.isFinite(row.max_attempts)
            ? Math.max(1, Math.floor(row.max_attempts))
            : undefined;

        await JobStateTracker.pendingRecovery({
          queueName: row.queue_name,
          jobId: row.job_id,
          reason: 'Persisted pending job stale during reconciliation',
          attempts: persistedAttempts + 1,
          maxAttempts,
        });
      })
    );

    return actionableRows.length;
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
