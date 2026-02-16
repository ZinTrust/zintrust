import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ZintrustLang } from '@lang/lang';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import type {
  JobStateTrackerPersistenceAdapter,
  JobTrackingRecord,
  JobTrackingTransition,
} from '@queue/JobStateTracker';
import { JobStateTracker } from '@queue/JobStateTracker';

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

const toNonNullJson = (value: unknown): string | null => {
  const json = toJson(value);
  return json ?? null;
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
    payload_json: toNonNullJson(record.payload),
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

const serializeJobRecordForInsert = (
  record: JobTrackingRecord,
  options: JobStateTrackerDbOptions
): Record<string, unknown> => {
  const payload = serializeJobRecord(record, options);

  // Ensure payload_json is always non-null for inserts (some schemas require NOT NULL).
  if (payload['payload_json'] === null) {
    payload['payload_json'] = '{}';
  }

  return payload;
};

type UpdateEntry = {
  key: string;
  enabled: boolean;
  value: unknown;
};

const applyUpdateEntries = (update: Record<string, unknown>, entries: UpdateEntry[]): void => {
  entries.forEach((entry) => {
    if (entry.enabled) update[entry.key] = entry.value;
  });
};

const resolveResultEntry = (
  record: JobTrackingRecord,
  options: JobStateTrackerDbOptions,
  base: Record<string, unknown>
): UpdateEntry => {
  if (options.persistResult === false) {
    return { key: 'result_json', enabled: true, value: null };
  }

  const enabled = record.result !== undefined && base['result_json'] !== null;
  return { key: 'result_json', enabled, value: base['result_json'] };
};

const serializeJobRecordForUpdate = (
  record: JobTrackingRecord,
  options: JobStateTrackerDbOptions
): Record<string, unknown> => {
  const base = serializeJobRecord(record, options);
  const update: Record<string, unknown> = {
    status: base['status'],
    attempts: base['attempts'],
    updated_at: base['updated_at'],
  };

  applyUpdateEntries(update, [
    { key: 'max_attempts', enabled: record.maxAttempts !== undefined, value: base['max_attempts'] },
    resolveResultEntry(record, options, base),
    { key: 'last_error', enabled: record.lastError !== undefined, value: base['last_error'] },
    {
      key: 'last_error_code',
      enabled: record.lastErrorCode !== undefined,
      value: base['last_error_code'],
    },
    { key: 'retry_at', enabled: record.retryAt !== undefined, value: base['retry_at'] },
    { key: 'timeout_at', enabled: record.timeoutAt !== undefined, value: base['timeout_at'] },
    { key: 'heartbeat_at', enabled: record.heartbeatAt !== undefined, value: base['heartbeat_at'] },
    {
      key: 'expected_completion_at',
      enabled: record.expectedCompletionAt !== undefined,
      value: base['expected_completion_at'],
    },
    { key: 'worker_name', enabled: record.workerName !== undefined, value: base['worker_name'] },
    {
      key: 'worker_instance_id',
      enabled: record.workerInstanceId !== undefined,
      value: base['worker_instance_id'],
    },
    {
      key: 'worker_region',
      enabled: record.workerRegion !== undefined,
      value: base['worker_region'],
    },
    {
      key: 'worker_version',
      enabled: record.workerVersion !== undefined,
      value: base['worker_version'],
    },
    { key: 'recovered_at', enabled: record.recoveredAt !== undefined, value: base['recovered_at'] },
    {
      key: 'idempotency_key',
      enabled: record.idempotencyKey !== undefined,
      value: base['idempotency_key'],
    },
    { key: 'started_at', enabled: record.startedAt !== undefined, value: base['started_at'] },
    { key: 'completed_at', enabled: record.completedAt !== undefined, value: base['completed_at'] },
  ]);

  return update;
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

  const persistTransitions = (): boolean =>
    Env.getBool('JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED', false);

  const shouldInsertNewRow = (record: JobTrackingRecord): boolean => {
    // zintrust_jobs is an enqueue-fallback buffer: only jobs that failed to enqueue
    // should be inserted into persistence. Once the job is in QUEUE_DRIVER, we only
    // update the existing row (e.g., status=enqueued) but never create new rows.
    return record.status === 'pending_recovery';
  };

  const upsertJob = async (record: JobTrackingRecord): Promise<void> => {
    const db = getDatabase(connectionName);
    if (db === null) return;

    const existing = await db
      .table(jobsTable)
      .where('job_id', '=', record.jobId)
      .where('queue_name', '=', record.queueName)
      .first<{ status?: unknown }>();

    if (existing) {
      const existingStatus =
        typeof existing.status === 'string' ? existing.status.trim().toLowerCase() : '';
      if (existingStatus === 'enqueued') return;

      const payload = serializeJobRecordForUpdate(record, options);
      await db
        .table(jobsTable)
        .where('job_id', '=', record.jobId)
        .where('queue_name', '=', record.queueName)
        .update(payload);
      return;
    }

    if (!shouldInsertNewRow(record)) return;
    const payload = serializeJobRecordForInsert(record, options);
    await db.table(jobsTable).insert(payload);
  };

  const insertTransition = async (transition: JobTrackingTransition): Promise<void> => {
    if (persistTransitions() === false) return;
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
