import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ZintrustLang } from '@lang/lang';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import { JobStateTracker } from '@queue/JobStateTracker';
import type {
  JobStateTrackerPersistenceAdapter,
  JobTrackingRecord,
  JobTrackingTransition,
} from '@queue/JobStateTracker';

type JobStateTrackerDbOptions = {
  connectionName?: string;
  jobsTable?: string;
  transitionsTable?: string;
  persistPayload?: boolean;
  persistResult?: boolean;
};

const toJson = (value: unknown): string | null => {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const toSqlDateTime = (isoLike: string | undefined): string | null => {
  if (typeof isoLike !== 'string' || isoLike.trim().length === 0) return null;
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
};

const getConnectionName = (options: JobStateTrackerDbOptions): string => {
  if (options.connectionName !== undefined && options.connectionName.trim().length > 0) {
    return options.connectionName.trim();
  }
  return Env.get('JOB_TRACKING_DB_CONNECTION', 'default');
};

const getJobsTable = (options: JobStateTrackerDbOptions): string => {
  if (options.jobsTable !== undefined && options.jobsTable.trim().length > 0) {
    return options.jobsTable.trim();
  }
  return Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs');
};

const getTransitionsTable = (options: JobStateTrackerDbOptions): string => {
  if (options.transitionsTable !== undefined && options.transitionsTable.trim().length > 0) {
    return options.transitionsTable.trim();
  }
  return Env.get('JOB_TRACKING_DB_TRANSITIONS_TABLE', 'zintrust_job_transitions');
};

const getDatabase = (connectionName: string): IDatabase | null => {
  try {
    return useDatabase(undefined, connectionName);
  } catch (error) {
    Logger.warn('Job tracking database connection is unavailable', {
      connectionName,
      error,
    });
    return null;
  }
};

const serializeJobRecord = (
  record: JobTrackingRecord,
  options: JobStateTrackerDbOptions
): Record<string, unknown> => {
  return {
    job_id: record.jobId,
    queue_name: record.queueName,
    status: record.status,
    attempts: record.attempts,
    max_attempts: record.maxAttempts ?? null,
    payload_json: options.persistPayload === false ? null : toJson(record.payload),
    result_json: options.persistResult === false ? null : toJson(record.result),
    last_error: record.lastError ?? null,
    last_error_code: record.lastErrorCode ?? null,
    retry_at: toSqlDateTime(record.retryAt),
    timeout_at: toSqlDateTime(record.timeoutAt),
    heartbeat_at: toSqlDateTime(record.heartbeatAt),
    expected_completion_at: toSqlDateTime(record.expectedCompletionAt),
    worker_name: record.workerName ?? null,
    worker_instance_id: record.workerInstanceId ?? null,
    worker_region: record.workerRegion ?? null,
    worker_version: record.workerVersion ?? null,
    recovered_at: toSqlDateTime(record.recoveredAt),
    idempotency_key: record.idempotencyKey ?? null,
    created_at: toSqlDateTime(record.createdAt),
    started_at: toSqlDateTime(record.startedAt),
    completed_at: toSqlDateTime(record.completedAt),
    updated_at: toSqlDateTime(record.updatedAt),
  };
};

const serializeTransition = (transition: JobTrackingTransition): Record<string, unknown> => {
  return {
    job_id: transition.jobId,
    queue_name: transition.queueName,
    from_status: transition.fromStatus,
    to_status: transition.toStatus,
    reason: transition.reason,
    attempts: transition.attempts ?? null,
    error: transition.error ?? null,
    transitioned_at: toSqlDateTime(transition.timestamp),
  };
};

export const createJobStateTrackerDbPersistence = (
  options: JobStateTrackerDbOptions = {}
): JobStateTrackerPersistenceAdapter => {
  const connectionName = getConnectionName(options);
  const jobsTable = getJobsTable(options);
  const transitionsTable = getTransitionsTable(options);

  const upsertJob = async (record: JobTrackingRecord): Promise<void> => {
    const db = getDatabase(connectionName);
    if (db === null) return;

    const payload = serializeJobRecord(record, options);
    const existing = await db
      .table(jobsTable)
      .where('job_id', '=', record.jobId)
      .where('queue_name', '=', record.queueName)
      .first<Record<string, unknown>>();

    if (existing) {
      await db
        .table(jobsTable)
        .where('job_id', '=', record.jobId)
        .where('queue_name', '=', record.queueName)
        .update(payload);
      return;
    }

    await db.table(jobsTable).insert(payload);
  };

  const insertTransition = async (transition: JobTrackingTransition): Promise<void> => {
    const db = getDatabase(connectionName);
    if (db === null) return;

    await db.table(transitionsTable).insert(serializeTransition(transition));
  };

  return Object.freeze({
    upsertJob,
    insertTransition,
  });
};

export const autoRegisterJobStateTrackerPersistenceFromEnv = (): boolean => {
  const trackingEnabled = Env.getBool('JOB_TRACKING_ENABLED', true);
  const persistenceEnabled = Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false);

  if (trackingEnabled === false || persistenceEnabled === false) {
    JobStateTracker.clearPersistenceAdapter();
    return false;
  }

  const driver = Env.get('JOB_TRACKING_PERSISTENCE_DRIVER', ZintrustLang.DATABASE)
    .trim()
    .toLowerCase();
  if (driver !== ZintrustLang.DATABASE) {
    Logger.warn('Unsupported job tracking persistence driver, skipping auto-registration', {
      driver,
    });
    JobStateTracker.clearPersistenceAdapter();
    return false;
  }

  JobStateTracker.registerPersistenceAdapter(createJobStateTrackerDbPersistence());
  return true;
};

export default createJobStateTrackerDbPersistence;
