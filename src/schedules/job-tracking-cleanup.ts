import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import { Schedule } from '@scheduler/Schedule';

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

const assertSafeTableName = (raw: string, label: string): string => {
  const value = raw.trim();
  if (value.length === 0) throw ErrorFactory.createGeneralError(`${label} table is empty`);
  // allow db.schema.table and underscores
  if (!/^[A-Za-z0-9_.]+$/u.test(value)) {
    throw ErrorFactory.createGeneralError(`${label} table contains invalid characters: ${value}`);
  }
  return value;
};

const cleanupJobTrackingBatch = async (): Promise<{
  retentionDays: number;
  cutoffIso: string;
  batchSize: number;
  deletedTransitions: number;
  deletedJobs: number;
}> => {
  const connection = Env.get('JOB_TRACKING_DB_CONNECTION', 'default');
  const jobsTable = assertSafeTableName(Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs'), 'Jobs');
  const transitionsTable = assertSafeTableName(
    Env.get('JOB_TRACKING_DB_TRANSITIONS_TABLE', 'zintrust_job_transitions'),
    'Transitions'
  );

  const retentionHoursRaw = Env.get('JOB_TRACKING_CLEANUP_RETENTION_HOURS', '').trim();
  const retentionHours =
    retentionHoursRaw.length > 0 ? Number.parseFloat(retentionHoursRaw) : Number.NaN;
  const retentionDays = Math.max(1, Env.getInt('JOB_TRACKING_CLEANUP_RETENTION_DAYS', 30));
  const batchSize = Math.max(100, Env.getInt('JOB_TRACKING_CLEANUP_BATCH_SIZE', 5000));

  const retentionMs =
    Number.isFinite(retentionHours) && retentionHours > 0
      ? retentionHours * 60 * 60 * 1000
      : retentionDays * 24 * 60 * 60 * 1000;

  const cutoff = new Date(Date.now() - retentionMs);
  const cutoffSql = toSqlDateTime(cutoff);

  const db = useDatabase(undefined, connection);

  const transitionRows = await db
    .table(transitionsTable)
    .select('id')
    .where('transitioned_at', '<=', cutoffSql)
    .orderBy('id', 'ASC')
    .limit(batchSize)
    .get<{ id?: unknown }>();

  const transitionIds = (transitionRows ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id))
    .map((id) => Math.floor(id));

  if (transitionIds.length > 0) {
    await db.table(transitionsTable).whereIn('id', transitionIds).delete();
  }

  const jobRows = await db
    .table(jobsTable)
    .select('id')
    .where('status', '=', 'enqueued')
    .where('updated_at', '<=', cutoffSql)
    .orderBy('id', 'ASC')
    .limit(batchSize)
    .get<{ id?: unknown }>();

  const jobIds = (jobRows ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id))
    .map((id) => Math.floor(id));

  if (jobIds.length > 0) {
    await db.table(jobsTable).whereIn('id', jobIds).delete();
  }

  return {
    retentionDays,
    cutoffIso: cutoff.toISOString(),
    batchSize,
    deletedTransitions: transitionIds.length,
    deletedJobs: jobIds.length,
  };
};

export const cleanupJobTrackingOnce = async (): Promise<void> => {
  const result = await cleanupJobTrackingBatch();
  Logger.info('Job tracking cleanup batch completed', {
    retentionDays: result.retentionDays,
    cutoff: result.cutoffIso,
    deletedTransitions: result.deletedTransitions,
    deletedJobs: result.deletedJobs,
    batchSize: result.batchSize,
  });
};

const enabled = Env.getBool('JOB_TRACKING_CLEANUP_ENABLED', false);
const intervalMs = Env.getInt('JOB_TRACKING_CLEANUP_INTERVAL_MS', 6 * 60 * 60 * 1000);

const JobTrackingCleanupSchedule = Schedule.define('jobTracking.cleanup', async () => {
  const maxBatches = Math.max(1, Env.getInt('JOB_TRACKING_CLEANUP_MAX_BATCHES', 1));
  let batchesRun = 0;
  let deletedTransitionsTotal = 0;
  let deletedJobsTotal = 0;
  let retentionDays: number | undefined;
  let cutoffIso: string | undefined;
  let batchSize: number | undefined;

  for (let i = 0; i < maxBatches; i += 1) {
    // Bounded sequential batches are intentional; we want predictable DB load.
    // eslint-disable-next-line no-await-in-loop
    const result = await cleanupJobTrackingBatch();
    batchesRun += 1;
    deletedTransitionsTotal += result.deletedTransitions;
    deletedJobsTotal += result.deletedJobs;
    retentionDays = result.retentionDays;
    cutoffIso = result.cutoffIso;
    batchSize = result.batchSize;

    if (result.deletedTransitions + result.deletedJobs === 0) {
      break;
    }
  }

  Logger.info('Job tracking cleanup run completed', {
    retentionDays,
    cutoff: cutoffIso,
    batchSize,
    batchesRun,
    maxBatches,
    deletedTransitionsTotal,
    deletedJobsTotal,
  });
})
  .intervalMs(intervalMs)
  .withoutOverlapping({ provider: Env.get('JOB_TRACKING_CLEANUP_LOCK_PROVIDER', 'memory') })
  .enabledWhen(enabled)
  .build();

export default JobTrackingCleanupSchedule;
