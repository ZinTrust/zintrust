import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { databaseConfig } from '@config/database';
import { Logger } from '@config/logger';
import { queueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { resetDatabase, useDatabase } from '@orm/Database';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
import { JobStateTracker, type JobTrackingRecord } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';
import { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
import { registerQueuesFromRuntimeConfig } from '@queue/QueueRuntimeRegistration';

type QueueRecoveryCommandOptions = CommandOptions & {
  list?: boolean;
  once?: boolean;
  start?: boolean;
  jobId?: string;
  queue?: string;
  status?: string;
  limit?: string;
  source?: string;
  json?: boolean;
  push?: boolean;
  dryRun?: boolean;
  dbLookup?: boolean;
};

type ListSource = 'memory' | 'db' | 'server' | 'auto';

type TrackerApiResponse = {
  records?: unknown;
};

type PersistedJobRow = {
  queue_name: string;
  job_id: string;
  status: string;
  attempts?: number | null;
  max_attempts?: number | null;
  payload_json?: string | null;
  result_json?: string | null;
  last_error?: string | null;
  last_error_code?: string | null;
  retry_at?: string | null;
  timeout_at?: string | null;
  expected_completion_at?: string | null;
  worker_name?: string | null;
  worker_instance_id?: string | null;
  worker_region?: string | null;
  worker_version?: string | null;
  recovered_at?: string | null;
  idempotency_key?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};

const toSafeObject = (value: unknown): Record<string, unknown> => {
  if (value !== null && value !== undefined && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
};

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const toAttempts = (value: unknown): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(0, parsed);
  return 0;
};

const toMaxAttempts = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return undefined;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value;
};

const toCreatedAt = (value: unknown): string => {
  const parsed = toOptionalString(value);
  return parsed ?? new Date().toISOString();
};

const toUpdatedAt = (value: unknown, createdAt: string): string => {
  const parsed = toOptionalString(value);
  return parsed ?? createdAt;
};

const normalizeStatus = (value: string | undefined): JobTrackingRecord['status'] => {
  const normalized = (value ?? '').trim().toLowerCase();
  const statuses: ReadonlyArray<JobTrackingRecord['status']> = [
    'pending',
    'active',
    'enqueued',
    'completed',
    'failed',
    'stalled',
    'timeout',
    'pending_recovery',
    'dead_letter',
    'manual_review',
    'delayed',
  ];

  const matched = statuses.find((entry) => entry === normalized);
  return matched ?? 'pending_recovery';
};

const toRecordFromPersisted = (row: PersistedJobRow): JobTrackingRecord => {
  const createdAt = toCreatedAt(row.created_at);
  const updatedAt = toUpdatedAt(row.updated_at, createdAt);

  return {
    queueName: row.queue_name,
    jobId: row.job_id,
    status: normalizeStatus(row.status),
    attempts: toAttempts(row.attempts),
    maxAttempts: toMaxAttempts(row.max_attempts),
    payload: parseJson(row.payload_json),
    result: parseJson(row.result_json),
    lastError: toOptionalString(row.last_error),
    lastErrorCode: toOptionalString(row.last_error_code),
    retryAt: toOptionalString(row.retry_at),
    timeoutAt: toOptionalString(row.timeout_at),
    expectedCompletionAt: toOptionalString(row.expected_completion_at),
    workerName: toOptionalString(row.worker_name),
    workerInstanceId: toOptionalString(row.worker_instance_id),
    workerRegion: toOptionalString(row.worker_region),
    workerVersion: toOptionalString(row.worker_version),
    recoveredAt: toOptionalString(row.recovered_at),
    idempotencyKey: toOptionalString(row.idempotency_key),
    createdAt,
    startedAt: toOptionalString(row.started_at),
    completedAt: toOptionalString(row.completed_at),
    updatedAt,
  };
};

const getRecoverableStatuses = (): Set<JobTrackingRecord['status']> => {
  return new Set<JobTrackingRecord['status']>(['pending_recovery']);
};

const getAllStatuses = (): Set<JobTrackingRecord['status']> => {
  return new Set<JobTrackingRecord['status']>([
    'pending',
    'active',
    'enqueued',
    'completed',
    'failed',
    'stalled',
    'timeout',
    'pending_recovery',
    'dead_letter',
    'manual_review',
    'delayed',
  ]);
};

const parseLimit = (raw: string | undefined): number => {
  if (raw === undefined) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(5000, parsed);
  }
  throw ErrorFactory.createConfigError(`Invalid --limit value: ${raw}`);
};

const parseStatus = (raw: string | undefined): JobTrackingRecord['status'] | undefined => {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const normalized = raw.trim().toLowerCase() as JobTrackingRecord['status'];
  if (getAllStatuses().has(normalized)) return normalized;
  throw ErrorFactory.createConfigError(`Invalid --status value: ${raw}`);
};

const formatRows = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((header, index) => {
    const maxRow = Math.max(...rows.map((row) => (row[index] ?? '').length), 0);
    return Math.max(header.length, maxRow);
  });

  const line = (values: string[]): string =>
    values.map((value, index) => value.padEnd(widths[index] ?? value.length)).join(' | ');

  const divider = widths.map((width) => '-'.repeat(width)).join('-+-');
  return [line(headers), divider, ...rows.map((row) => line(row))].join('\n');
};

const listFromMemory = (input: {
  queueName?: string;
  status?: JobTrackingRecord['status'];
  limit: number;
}): JobTrackingRecord[] => {
  return JobStateTracker.list({
    queueName: input.queueName,
    status: input.status,
    limit: input.limit,
  });
};

const toRecordFromUnknown = (raw: unknown): JobTrackingRecord | null => {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const queueName = typeof row['queueName'] === 'string' ? row['queueName'] : '';
  const jobId = typeof row['jobId'] === 'string' ? row['jobId'] : '';
  if (queueName.trim().length === 0 || jobId.trim().length === 0) return null;

  const attemptsRaw = row['attempts'];
  const attempts =
    typeof attemptsRaw === 'number' && Number.isFinite(attemptsRaw) ? Math.max(0, attemptsRaw) : 0;

  return {
    queueName,
    jobId,
    status: normalizeStatus(typeof row['status'] === 'string' ? row['status'] : undefined),
    attempts,
    maxAttempts: toMaxAttempts(row['maxAttempts']),
    payload: row['payload'],
    result: row['result'],
    lastError: toOptionalString(row['lastError']),
    lastErrorCode: toOptionalString(row['lastErrorCode']),
    retryAt: toOptionalString(row['retryAt']),
    timeoutAt: toOptionalString(row['timeoutAt']),
    expectedCompletionAt: toOptionalString(row['expectedCompletionAt']),
    workerName: toOptionalString(row['workerName']),
    workerInstanceId: toOptionalString(row['workerInstanceId']),
    workerRegion: toOptionalString(row['workerRegion']),
    workerVersion: toOptionalString(row['workerVersion']),
    recoveredAt: toOptionalString(row['recoveredAt']),
    idempotencyKey: toOptionalString(row['idempotencyKey']),
    createdAt: toCreatedAt(row['createdAt']),
    startedAt: toOptionalString(row['startedAt']),
    completedAt: toOptionalString(row['completedAt']),
    updatedAt: toUpdatedAt(row['updatedAt'], toCreatedAt(row['createdAt'])),
  };
};

const resolveTrackerApiBaseUrl = (): string => {
  const explicit = (process.env['QUEUE_TRACKER_API_URL'] ?? '').trim();
  if (explicit.length > 0) return explicit;

  const appUrl = (process.env['APP_URL'] ?? '').trim();
  if (appUrl.length > 0) return appUrl;

  return 'http://127.0.0.1:7777';
};

const listFromServer = async (input: {
  queueName?: string;
  status?: JobTrackingRecord['status'];
  limit: number;
}): Promise<JobTrackingRecord[]> => {
  const baseUrl = resolveTrackerApiBaseUrl();
  const url = new URL('/_debug/queue/tracker', baseUrl);
  url.searchParams.set('limit', String(input.limit));
  if (input.queueName !== undefined && input.queueName.trim().length > 0) {
    url.searchParams.set('queue', input.queueName.trim());
  }
  if (input.status !== undefined) {
    url.searchParams.set('status', input.status);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
  });

  if (!response.ok) {
    throw ErrorFactory.createConnectionError(`Tracker API returned HTTP ${response.status}`, {
      status: response.status,
      url: url.toString(),
    });
  }

  const json = (await response.json()) as TrackerApiResponse;
  const rawRecords = Array.isArray(json.records) ? json.records : [];
  return rawRecords
    .map(toRecordFromUnknown)
    .filter((row): row is JobTrackingRecord => row !== null);
};

const listFromPersistence = async (input: {
  queueName?: string;
  status?: JobTrackingRecord['status'];
  limit: number;
}): Promise<JobTrackingRecord[]> => {
  const db = useDatabase(undefined, process.env['JOB_TRACKING_DB_CONNECTION'] ?? 'default');
  let query = db
    .table(process.env['JOB_TRACKING_DB_TABLE'] ?? 'zintrust_jobs')
    .orderBy('updated_at', 'DESC')
    .limit(input.limit);

  if (input.queueName !== undefined && input.queueName.trim().length > 0) {
    query = query.where('queue_name', '=', input.queueName.trim());
  }

  if (input.status !== undefined) {
    query = query.where('status', '=', input.status);
  }

  const rows = await query.get<PersistedJobRow>();
  return (rows ?? []).map(toRecordFromPersisted);
};

const printJobList = (rows: JobTrackingRecord[], asJson: boolean): void => {
  if (asJson) {
    Logger.info(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    Logger.info('No jobs found for the provided filters');
    return;
  }

  const table = formatRows(
    ['Job ID', 'Queue', 'Status', 'Attempts', 'Updated'],
    rows.map((row) => [row.jobId, row.queueName, row.status, String(row.attempts), row.updatedAt])
  );

  Logger.info(`\n${table}`);
};

const runListJobs = async (options: {
  queueName?: string;
  status?: JobTrackingRecord['status'];
  limit: number;
  source: ListSource;
  asJson: boolean;
}): Promise<void> => {
  const memoryRows = listFromMemory({
    queueName: options.queueName,
    status: options.status,
    limit: options.limit,
  });

  if (options.source === 'memory') {
    printJobList(memoryRows, options.asJson);
    return;
  }

  if (options.source === 'db') {
    const rows = await listFromPersistence({
      queueName: options.queueName,
      status: options.status,
      limit: options.limit,
    });
    printJobList(rows, options.asJson);
    return;
  }

  if (options.source === 'server') {
    const rows = await listFromServer({
      queueName: options.queueName,
      status: options.status,
      limit: options.limit,
    });
    printJobList(rows, options.asJson);
    return;
  }

  if (memoryRows.length > 0) {
    printJobList(memoryRows, options.asJson);
    return;
  }

  const isTestRuntime =
    (process.env['NODE_ENV'] ?? '').trim().toLowerCase() === 'test' ||
    Boolean(process.env['VITEST']);

  if (isTestRuntime) {
    printJobList(memoryRows, options.asJson);
    return;
  }

  try {
    const serverRows = await listFromServer({
      queueName: options.queueName,
      status: options.status,
      limit: options.limit,
    });
    if (serverRows.length > 0) {
      Logger.info('Tracker list sourced from running app process memory');
      printJobList(serverRows, options.asJson);
      return;
    }
  } catch (error) {
    Logger.warn('Failed to fetch tracker list from running app', {
      error: error instanceof Error ? error.message : String(error),
      trackerApiUrl: resolveTrackerApiBaseUrl(),
    });
  }

  printJobList(memoryRows, options.asJson);
};

const loadFromPersistence = async (
  jobId: string,
  queueName?: string
): Promise<JobTrackingRecord | null> => {
  const db = useDatabase(undefined, process.env['JOB_TRACKING_DB_CONNECTION'] ?? 'default');
  let query = db
    .table(process.env['JOB_TRACKING_DB_TABLE'] ?? 'zintrust_jobs')
    .where('job_id', '=', jobId);
  if (queueName !== undefined && queueName.trim().length > 0) {
    query = query.where('queue_name', '=', queueName.trim());
  }

  const row = await query.orderBy('updated_at', 'DESC').first<PersistedJobRow | null | undefined>();
  if (row === null || row === undefined) return null;
  return toRecordFromPersisted(row);
};

const findRecord = async (
  jobId: string,
  queueName: string | undefined,
  allowDbLookup: boolean
): Promise<JobTrackingRecord | null> => {
  const normalizedQueue = queueName?.trim();
  if (normalizedQueue !== undefined && normalizedQueue.length > 0) {
    const exact = JobStateTracker.get(normalizedQueue, jobId);
    if (exact) return exact;
  }

  const memoryMatches = JobStateTracker.list({ limit: 50000 }).filter((row) => {
    if (row.jobId !== jobId) return false;
    if (normalizedQueue !== undefined && normalizedQueue.length > 0) {
      return row.queueName === normalizedQueue;
    }
    return true;
  });
  if (memoryMatches.length > 0) {
    return memoryMatches[0] ?? null;
  }

  if (!allowDbLookup) return null;
  try {
    return await loadFromPersistence(jobId, normalizedQueue);
  } catch (error) {
    Logger.warn('Failed to load job from persistence', {
      jobId,
      queueName: normalizedQueue,
      error,
    });
    return null;
  }
};

const runRecoveryOnce = async (): Promise<void> => {
  const result = await JobRecoveryDaemon.runOnce();
  Logger.info('Queue recovery run completed', result);
};

const isDuplicateJobIdError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('jobid') && normalized.includes('already exists');
};

const validatePushable = (record: JobTrackingRecord): { ok: true } | { ok: false } => {
  if (record.status === 'enqueued') {
    Logger.info('Job is already enqueued; nothing to push', {
      jobId: record.jobId,
      queueName: record.queueName,
    });
    return { ok: false };
  }

  if (record.status !== 'pending_recovery') {
    Logger.error(
      `Refusing to push job in status ${record.status}. Only pending_recovery can be pushed.`
    );
    if (typeof process !== 'undefined') process.exitCode = 1;
    return { ok: false };
  }

  return { ok: true };
};

const runPushForJob = async (
  record: JobTrackingRecord,
  options: { dryRun: boolean }
): Promise<void> => {
  if (!validatePushable(record).ok) return;

  const basePayload = toSafeObject(record.payload);
  const hasPayload =
    record.payload !== undefined &&
    record.payload !== null &&
    typeof record.payload === 'object' &&
    Object.keys(basePayload).length > 0;

  if (options.dryRun) {
    Logger.info('Dry-run: skipping enqueue for target job', {
      jobId: record.jobId,
      queueName: record.queueName,
      status: record.status,
    });
    return;
  }

  if (!hasPayload) {
    Logger.error(
      `Cannot push job because payload is missing in tracker/persistence store: ${record.jobId}. ` +
        'Rehydrate payload_json first (or use policy recovery states) before pushing.'
    );
    if (typeof process !== 'undefined') process.exitCode = 1;
    return;
  }

  const payload = {
    ...basePayload,
    uniqueId: record.jobId,
    attempts: typeof record.maxAttempts === 'number' ? record.maxAttempts : 3,
    _currentAttempts: Math.max(0, Math.floor(record.attempts ?? 0)),
    timestamp: Date.now(),
  };

  let replayJobId: string;
  try {
    replayJobId = await Queue.enqueue(record.queueName, payload, 'default');
  } catch (error: unknown) {
    if (isDuplicateJobIdError(error)) {
      replayJobId = record.jobId;
    } else {
      throw error;
    }
  }

  await JobStateTracker.handedOffToQueue({
    queueName: record.queueName,
    jobId: record.jobId,
    reason: `CLI pushed job as ${replayJobId}`,
  });

  Logger.info('Target job pushed to queue', {
    originalJobId: record.jobId,
    replayJobId,
    queueName: record.queueName,
  });
};

const isTestRuntime = (): boolean =>
  (process.env['NODE_ENV'] ?? '').trim().toLowerCase() === 'test' || Boolean(process.env['VITEST']);

const cleanupOneOffCli = async (): Promise<void> => {
  try {
    QueueReliabilityOrchestrator.stop();
  } catch {
    // ignore
  }

  try {
    await resetDatabase();
  } catch {
    // ignore
  }
};

const runRecoverOneForJob = async (
  record: JobTrackingRecord,
  options: { dryRun: boolean }
): Promise<void> => {
  if (options.dryRun) {
    Logger.info('Dry-run: skipping policy recovery for target job', {
      jobId: record.jobId,
      queueName: record.queueName,
      status: record.status,
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
    });
    return;
  }

  const outcome = await JobRecoveryDaemon.recoverOne(record);
  Logger.info('Target job recovery completed', {
    jobId: record.jobId,
    queueName: record.queueName,
    outcome,
  });
};

type ResolvedExecutionOptions = {
  list: boolean;
  runOnce: boolean;
  start: boolean;
  hasJobId: boolean;
  jobId?: string;
  queueName?: string;
  status?: JobTrackingRecord['status'];
  limit: number;
  source: ListSource;
  asJson: boolean;
  dryRun: boolean;
  push: boolean;
  allowDbLookup: boolean;
};

const resolveExecutionOptions = (
  options: QueueRecoveryCommandOptions
): ResolvedExecutionOptions => {
  const jobIdRaw = typeof options.jobId === 'string' ? options.jobId.trim() : '';
  const hasJobId = jobIdRaw.length > 0;
  const sourceRaw = (options.source ?? 'auto').trim().toLowerCase();
  let source: ListSource = 'auto';

  if (sourceRaw === 'db') {
    source = 'db';
  } else if (sourceRaw === 'server') {
    source = 'server';
  } else if (sourceRaw === 'memory') {
    source = 'memory';
  }

  if (
    options.source !== undefined &&
    sourceRaw !== 'memory' &&
    sourceRaw !== 'db' &&
    sourceRaw !== 'server' &&
    sourceRaw !== 'auto'
  ) {
    throw ErrorFactory.createConfigError(`Invalid --source value: ${options.source}`);
  }

  return {
    list: options.list === true,
    runOnce: options.once === true,
    start: options.start === true,
    hasJobId,
    jobId: hasJobId ? jobIdRaw : undefined,
    queueName: typeof options.queue === 'string' ? options.queue.trim() : undefined,
    status: parseStatus(options.status),
    limit: parseLimit(options.limit),
    source,
    asJson: options.json === true,
    dryRun: options.dryRun === true,
    push: options.push === true,
    allowDbLookup: options.dbLookup !== false,
  };
};

const maybeRunListMode = async (resolved: ResolvedExecutionOptions): Promise<boolean> => {
  if (!resolved.list) return false;

  await runListJobs({
    queueName: resolved.queueName,
    status: resolved.status,
    limit: resolved.limit,
    source: resolved.source,
    asJson: resolved.asJson,
  });
  return true;
};

const maybeRunDefaultRecovery = async (resolved: ResolvedExecutionOptions): Promise<boolean> => {
  if (resolved.runOnce || resolved.start || resolved.hasJobId) return false;
  await runRecoveryOnce();
  return true;
};

const runTargetedRecovery = async (resolved: ResolvedExecutionOptions): Promise<void> => {
  if (!resolved.hasJobId || resolved.jobId === undefined) return;

  const record = await findRecord(resolved.jobId, resolved.queueName, resolved.allowDbLookup);
  if (record === null) {
    Logger.error(
      `Job not found in tracker${resolved.allowDbLookup ? ' or persistence store' : ''}: ${resolved.jobId}`
    );
    if (typeof process !== 'undefined') process.exitCode = 1;
    return;
  }

  if (record.status === 'enqueued') {
    Logger.info('Job already enqueued; nothing to recover', {
      jobId: record.jobId,
      queueName: record.queueName,
    });
    return;
  }

  if (!resolved.push && !getRecoverableStatuses().has(record.status)) {
    Logger.error(
      `Job status is not recoverable via policy runner: ${record.status}. Use --push to force requeue.`
    );
    if (typeof process !== 'undefined') process.exitCode = 1;
    return;
  }

  if (resolved.push) {
    await runPushForJob(record, { dryRun: resolved.dryRun });
    return;
  }

  await runRecoverOneForJob(record, { dryRun: resolved.dryRun });
};

const finalizeRecoveryExecution = async (resolved: ResolvedExecutionOptions): Promise<void> => {
  if (resolved.runOnce) {
    await runRecoveryOnce();
  }

  if (resolved.start) {
    QueueReliabilityOrchestrator.start();
    Logger.info('Queue reliability orchestrator is running');
  }
};

const executeQueueRecovery = async (options: QueueRecoveryCommandOptions): Promise<void> => {
  const resolved = resolveExecutionOptions(options);

  if (await maybeRunListMode(resolved)) return;

  // Ensure DB connections exist for optional persistence lookups.
  // (CLI commands don't run full app bootstrap.)
  registerDatabasesFromRuntimeConfig(databaseConfig);

  const envDefault = (process.env['QUEUE_DRIVER'] ?? '').toString().trim().toLowerCase();
  const cliQueueConfig = {
    ...queueConfig,
    default: (envDefault.length > 0
      ? envDefault
      : queueConfig.default) as typeof queueConfig.default,
  };

  await registerQueuesFromRuntimeConfig(cliQueueConfig);
  if (!resolved.start) {
    // Queue registration may auto-start orchestrator when JOB_RELIABILITY_AUTOSTART=true.
    // For one-off CLI runs, stop it to avoid noisy intervals.
    QueueReliabilityOrchestrator.stop();
  }
  if (await maybeRunDefaultRecovery(resolved)) return;

  await runTargetedRecovery(resolved);
  await finalizeRecoveryExecution(resolved);

  if (!resolved.start) {
    await cleanupOneOffCli();
    if (!isTestRuntime() && typeof process !== 'undefined') {
      process.exit(process.exitCode ?? 0);
    }
  }
};

export const QueueRecoveryCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'queue:recovery',
      description: 'Run queue recovery once, start orchestrator, or recover/push a specific job',
      addOptions: (command) => {
        command
          .option('--list', 'List tracked jobs')
          .option('--once', 'Run recovery daemon one time')
          .option('--start', 'Start queue reliability orchestrator intervals')
          .option('--job-id <id>', 'Target specific job id')
          .option('--queue <name>', 'Queue name for targeted job lookup')
          .option('--status <status>', 'Filter listed jobs by status')
          .option('--limit <count>', 'Limit listed jobs (default: 50, max: 5000)')
          .option('--source <source>', 'List source: auto|memory|server|db (default: auto)')
          .option('--json', 'Render list output as JSON')
          .option('--push', 'Force direct requeue of target job payload')
          .option('--dry-run', 'Log actions without enqueueing/recovering')
          .option('--no-db-lookup', 'Disable fallback DB lookup for target job');
      },
      execute: executeQueueRecovery,
    });
  },
});

export default QueueRecoveryCommand;
