import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { QueueDataRedactor } from '@queue/QueueDataRedactor';

export type JobTrackingStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'timeout'
  | 'pending_recovery'
  | 'dead_letter'
  | 'manual_review'
  | 'delayed';

export type JobTrackingRecord = {
  jobId: string;
  queueName: string;
  status: JobTrackingStatus;
  attempts: number;
  maxAttempts?: number;
  payload?: unknown;
  result?: unknown;
  lastError?: string;
  lastErrorCode?: string;
  retryAt?: string;
  timeoutAt?: string;
  heartbeatAt?: string;
  expectedCompletionAt?: string;
  workerName?: string;
  workerInstanceId?: string;
  workerRegion?: string;
  workerVersion?: string;
  recoveredAt?: string;
  idempotencyKey?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

export type JobTrackingTransition = {
  jobId: string;
  queueName: string;
  fromStatus: JobTrackingStatus | null;
  toStatus: JobTrackingStatus;
  reason: string;
  timestamp: string;
  attempts?: number;
  error?: string;
};

export interface JobStateTrackerPersistenceAdapter {
  upsertJob(record: JobTrackingRecord): Promise<void>;
  insertTransition(transition: JobTrackingTransition): Promise<void>;
}

const trackedJobs = new Map<string, JobTrackingRecord>();
const transitions: JobTrackingTransition[] = [];
let persistenceAdapter: JobStateTrackerPersistenceAdapter | null = null;

const getKey = (queueName: string, jobId: string): string => `${queueName}:${jobId}`;

const nowIso = (): string => new Date().toISOString();

const isEnabled = (): boolean => Env.getBool('JOB_TRACKING_ENABLED', true);

const isPersistenceEnabled = (): boolean => Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false);

const toFinitePositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isFinite(value) === false) return undefined;
  if (value <= 0) return undefined;
  return Math.floor(value);
};

const normalizeError = (error: unknown): string | undefined => {
  if (error instanceof Error) return QueueDataRedactor.redactText(error.message);
  if (typeof error === 'string' && error.trim().length > 0) {
    return QueueDataRedactor.redactText(error);
  }
  return undefined;
};

const normalizeErrorCode = (error: unknown): string | undefined => {
  if (error === null || error === undefined || typeof error !== 'object') return undefined;
  const raw = (error as { code?: unknown }).code;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
};

const pruneJobs = (): void => {
  const maxJobs = Env.getInt('JOB_TRACKING_MAX_JOBS', 20000);
  while (trackedJobs.size > maxJobs) {
    const oldestKey = trackedJobs.keys().next().value;
    if (oldestKey === undefined) break;
    trackedJobs.delete(oldestKey);
  }
};

const appendTransition = (transition: JobTrackingTransition): void => {
  transitions.push(transition);
  const maxTransitions = Env.getInt('JOB_TRACKING_MAX_TRANSITIONS', 50000);
  if (transitions.length > maxTransitions) {
    transitions.splice(0, transitions.length - maxTransitions);
  }
};

const choose = <T>(first: T | undefined, second: T | undefined, third?: T): T | undefined => {
  if (first !== undefined) return first;
  if (second !== undefined) return second;
  return third;
};

const toEpochMs = (value: string | undefined): number | null => {
  if (value === undefined || value.trim().length === 0) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

type UpdateOptions = {
  attempts?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  retryAt?: string;
  maxAttempts?: number;
  payload?: unknown;
  timeoutAt?: string;
  expectedCompletionAt?: string;
  workerName?: string;
  workerInstanceId?: string;
  workerRegion?: string;
  workerVersion?: string;
  heartbeatAt?: string;
  lastErrorCode?: string;
  recoveredAt?: string;
  idempotencyKey?: string;
};

const resolveAttempts = (existing: JobTrackingRecord | undefined, options: UpdateOptions): number =>
  choose(options.attempts, existing?.attempts, 0) as number;

const resolveMaxAttempts = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): number | undefined => choose(options.maxAttempts, existing?.maxAttempts);

const resolvePayload = (existing: JobTrackingRecord | undefined, options: UpdateOptions): unknown =>
  choose(options.payload, existing?.payload);

const resolveResult = (existing: JobTrackingRecord | undefined, options: UpdateOptions): unknown =>
  choose(options.result, existing?.result);

const resolveError = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.error, existing?.lastError);

const resolveRetryAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.retryAt, existing?.retryAt);

const resolveTimeoutAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.timeoutAt, existing?.timeoutAt);

const resolveExpectedCompletionAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.expectedCompletionAt, existing?.expectedCompletionAt);

const resolveWorkerName = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.workerName, existing?.workerName);

const resolveWorkerInstanceId = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.workerInstanceId, existing?.workerInstanceId);

const resolveWorkerRegion = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.workerRegion, existing?.workerRegion);

const resolveWorkerVersion = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.workerVersion, existing?.workerVersion);

const resolveHeartbeatAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.heartbeatAt, existing?.heartbeatAt);

const resolveLastErrorCode = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.lastErrorCode, existing?.lastErrorCode);

const resolveRecoveredAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.recoveredAt, existing?.recoveredAt);

const resolveIdempotencyKey = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.idempotencyKey, existing?.idempotencyKey);

const resolveCreatedAt = (existing: JobTrackingRecord | undefined, timestamp: string): string =>
  choose(existing?.createdAt, timestamp, timestamp) as string;

const resolveStartedAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.startedAt, existing?.startedAt);

const resolveCompletedAt = (
  existing: JobTrackingRecord | undefined,
  options: UpdateOptions
): string | undefined => choose(options.completedAt, existing?.completedAt);

const buildRecord = (
  existing: JobTrackingRecord | undefined,
  queueName: string,
  jobId: string,
  toStatus: JobTrackingStatus,
  timestamp: string,
  options?: UpdateOptions
): JobTrackingRecord => {
  const resolvedOptions: UpdateOptions = options ?? {};
  const attempts = resolveAttempts(existing, resolvedOptions);
  const maxAttempts = resolveMaxAttempts(existing, resolvedOptions);
  const payload = resolvePayload(existing, resolvedOptions);
  const result = resolveResult(existing, resolvedOptions);
  const lastError = resolveError(existing, resolvedOptions);
  const retryAt = resolveRetryAt(existing, resolvedOptions);
  const timeoutAt = resolveTimeoutAt(existing, resolvedOptions);
  const expectedCompletionAt = resolveExpectedCompletionAt(existing, resolvedOptions);
  const workerName = resolveWorkerName(existing, resolvedOptions);
  const workerInstanceId = resolveWorkerInstanceId(existing, resolvedOptions);
  const workerRegion = resolveWorkerRegion(existing, resolvedOptions);
  const workerVersion = resolveWorkerVersion(existing, resolvedOptions);
  const heartbeatAt = resolveHeartbeatAt(existing, resolvedOptions);
  const lastErrorCode = resolveLastErrorCode(existing, resolvedOptions);
  const recoveredAt = resolveRecoveredAt(existing, resolvedOptions);
  const idempotencyKey = resolveIdempotencyKey(existing, resolvedOptions);
  const createdAt = resolveCreatedAt(existing, timestamp);
  const startedAt = resolveStartedAt(existing, resolvedOptions);
  const completedAt = resolveCompletedAt(existing, resolvedOptions);

  return {
    jobId,
    queueName,
    status: toStatus,
    attempts,
    maxAttempts,
    payload,
    result,
    lastError,
    lastErrorCode,
    retryAt,
    timeoutAt,
    expectedCompletionAt,
    workerName,
    workerInstanceId,
    workerRegion,
    workerVersion,
    heartbeatAt,
    recoveredAt,
    idempotencyKey,
    createdAt,
    startedAt,
    completedAt,
    updatedAt: timestamp,
  };
};

const updateStatus = (
  queueName: string,
  jobId: string,
  toStatus: JobTrackingStatus,
  reason: string,
  options?: UpdateOptions
): JobTrackingTransition => {
  const key = getKey(queueName, jobId);
  const existing = trackedJobs.get(key);
  const timestamp = nowIso();
  const next = buildRecord(existing, queueName, jobId, toStatus, timestamp, options);

  trackedJobs.set(key, next);
  const transition: JobTrackingTransition = {
    jobId,
    queueName,
    fromStatus: existing?.status ?? null,
    toStatus,
    reason,
    timestamp,
    attempts: next.attempts,
    error: options?.error,
  };
  appendTransition(transition);

  pruneJobs();
  return transition;
};

const persistLatest = async (
  queueName: string,
  jobId: string,
  transition?: JobTrackingTransition
): Promise<void> => {
  if (isPersistenceEnabled() === false) return;
  if (persistenceAdapter === null) return;

  const record = trackedJobs.get(getKey(queueName, jobId));
  if (record === undefined) return;

  try {
    await persistenceAdapter.upsertJob(record);
    if (transition !== undefined) {
      await persistenceAdapter.insertTransition(transition);
    }
  } catch (error) {
    Logger.warn('Job tracking persistence failed', { queueName, jobId, error });
  }
};

export const JobStateTracker = Object.freeze({
  isEnabled(): boolean {
    return isEnabled();
  },

  async enqueued(input: {
    queueName: string;
    jobId: string;
    payload?: unknown;
    attempts?: number;
    maxAttempts?: number;
    expectedCompletionAt?: string;
    idempotencyKey?: string;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(input.queueName, input.jobId, 'pending', 'Job enqueued', {
      attempts: typeof input.attempts === 'number' ? input.attempts : 0,
      maxAttempts: toFinitePositiveInt(input.maxAttempts),
      payload: QueueDataRedactor.sanitizePayload(input.payload),
      expectedCompletionAt: input.expectedCompletionAt,
      idempotencyKey: input.idempotencyKey,
    });
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async started(input: {
    queueName: string;
    jobId: string;
    attempts?: number;
    timeoutMs?: number;
    workerName?: string;
    workerInstanceId?: string;
    workerRegion?: string;
    workerVersion?: string;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const timeoutMs =
      typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
        ? Math.floor(input.timeoutMs)
        : undefined;
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      'active',
      'Job processing started',
      {
        attempts: toFinitePositiveInt(input.attempts) ?? 1,
        startedAt: nowIso(),
        expectedCompletionAt:
          timeoutMs === undefined ? undefined : new Date(Date.now() + timeoutMs).toISOString(),
        workerName: input.workerName,
        workerInstanceId: input.workerInstanceId,
        workerRegion: input.workerRegion,
        workerVersion: input.workerVersion,
        heartbeatAt: nowIso(),
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async completed(input: {
    queueName: string;
    jobId: string;
    processingTimeMs?: number;
    result?: unknown;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const reason =
      typeof input.processingTimeMs === 'number' && Number.isFinite(input.processingTimeMs)
        ? `Job completed in ${Math.max(0, Math.floor(input.processingTimeMs))}ms`
        : 'Job completed';
    const transition = updateStatus(input.queueName, input.jobId, 'completed', reason, {
      completedAt: nowIso(),
      result: QueueDataRedactor.sanitizePayload(input.result),
      retryAt: undefined,
      error: undefined,
      timeoutAt: undefined,
    });
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async failed(input: {
    queueName: string;
    jobId: string;
    attempts?: number;
    isFinal: boolean;
    retryAt?: string;
    error?: unknown;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const errorMessage = normalizeError(input.error);
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      input.isFinal ? 'failed' : 'pending',
      input.isFinal ? 'Job failed permanently' : 'Job failed and scheduled for retry',
      {
        attempts: toFinitePositiveInt(input.attempts),
        error: errorMessage,
        lastErrorCode: normalizeErrorCode(input.error),
        retryAt: input.isFinal ? undefined : input.retryAt,
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async heartbeat(input: {
    queueName: string;
    jobId: string;
    workerInstanceId?: string;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(input.queueName, input.jobId, 'active', 'Heartbeat updated', {
      heartbeatAt: nowIso(),
      workerInstanceId: input.workerInstanceId,
    });
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async timedOut(input: {
    queueName: string;
    jobId: string;
    reason?: string;
    error?: unknown;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      'timeout',
      input.reason ?? 'Job timed out',
      {
        timeoutAt: nowIso(),
        error: normalizeError(input.error) ?? input.reason ?? 'Job timed out',
        lastErrorCode: normalizeErrorCode(input.error),
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async stalled(input: { queueName: string; jobId: string; reason?: string }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      'stalled',
      input.reason ?? 'Job stalled',
      {
        error: input.reason,
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async pendingRecovery(input: {
    queueName: string;
    jobId: string;
    attempts?: number;
    maxAttempts?: number;
    reason?: string;
    error?: unknown;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      'pending_recovery',
      input.reason ?? 'Job pending recovery',
      {
        attempts:
          typeof input.attempts === 'number' && Number.isFinite(input.attempts)
            ? Math.max(0, Math.floor(input.attempts))
            : undefined,
        maxAttempts: toFinitePositiveInt(input.maxAttempts),
        error: normalizeError(input.error) ?? input.reason,
        lastErrorCode: normalizeErrorCode(input.error),
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async markedRecovered(input: {
    queueName: string;
    jobId: string;
    reason?: string;
    retryAt?: string;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(
      input.queueName,
      input.jobId,
      'pending',
      input.reason ?? 'Job re-queued for recovery',
      {
        recoveredAt: nowIso(),
        retryAt: input.retryAt,
      }
    );
    await persistLatest(input.queueName, input.jobId, transition);
  },

  async setTerminalStatus(input: {
    queueName: string;
    jobId: string;
    status: 'dead_letter' | 'manual_review' | 'failed' | 'completed';
    reason: string;
    error?: unknown;
  }): Promise<void> {
    if (isEnabled() === false) return;
    const transition = updateStatus(input.queueName, input.jobId, input.status, input.reason, {
      error: normalizeError(input.error),
      lastErrorCode: normalizeErrorCode(input.error),
      completedAt: input.status === 'completed' ? nowIso() : undefined,
    });
    await persistLatest(input.queueName, input.jobId, transition);
  },

  registerPersistenceAdapter(adapter: JobStateTrackerPersistenceAdapter): void {
    persistenceAdapter = adapter;
  },

  clearPersistenceAdapter(): void {
    persistenceAdapter = null;
  },

  get(queueName: string, jobId: string): JobTrackingRecord | undefined {
    return trackedJobs.get(getKey(queueName, jobId));
  },

  list(options?: {
    queueName?: string;
    status?: JobTrackingStatus;
    limit?: number;
  }): JobTrackingRecord[] {
    const filterQueueName = options?.queueName;
    const filterStatus = options?.status;
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : 100;

    const rows = Array.from(trackedJobs.values())
      .filter((row) => (filterQueueName === undefined ? true : row.queueName === filterQueueName))
      .filter((row) => (filterStatus === undefined ? true : row.status === filterStatus))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return rows.slice(0, limit);
  },

  getTransitions(options?: {
    queueName?: string;
    jobId?: string;
    limit?: number;
  }): JobTrackingTransition[] {
    const filterQueueName = options?.queueName;
    const filterJobId = options?.jobId;
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : 200;

    const rows = transitions
      .filter((row) => (filterQueueName === undefined ? true : row.queueName === filterQueueName))
      .filter((row) => (filterJobId === undefined ? true : row.jobId === filterJobId));

    if (rows.length <= limit) return [...rows];
    return rows.slice(rows.length - limit);
  },

  listActiveOlderThan(maxAgeMs: number, queueName?: string): JobTrackingRecord[] {
    const threshold = Date.now() - Math.max(0, Math.floor(maxAgeMs));
    return Array.from(trackedJobs.values()).filter((row) => {
      if (row.status !== 'active') return false;
      if (queueName !== undefined && row.queueName !== queueName) return false;
      const reference = toEpochMs(row.startedAt) ?? toEpochMs(row.updatedAt);
      if (reference === null) return false;
      return reference <= threshold;
    });
  },

  listPendingOlderThan(maxAgeMs: number, queueName?: string): JobTrackingRecord[] {
    const threshold = Date.now() - Math.max(0, Math.floor(maxAgeMs));
    return Array.from(trackedJobs.values()).filter((row) => {
      if (row.status !== 'pending') return false;
      if (queueName !== undefined && row.queueName !== queueName) return false;
      const reference = toEpochMs(row.updatedAt) ?? toEpochMs(row.createdAt);
      if (reference === null) return false;
      return reference <= threshold;
    });
  },

  listRecoverable(maxAgeMs: number, queueName?: string): JobTrackingRecord[] {
    const threshold = Date.now() - Math.max(0, Math.floor(maxAgeMs));
    const recoverable = new Set<JobTrackingStatus>(['pending_recovery', 'timeout', 'stalled']);
    return Array.from(trackedJobs.values()).filter((row) => {
      if (!recoverable.has(row.status)) return false;
      if (queueName !== undefined && row.queueName !== queueName) return false;
      const reference = toEpochMs(row.updatedAt);
      if (reference === null) return false;
      return reference <= threshold;
    });
  },

  listHeartbeatExpired(maxSilenceMs: number, queueName?: string): JobTrackingRecord[] {
    const threshold = Date.now() - Math.max(0, Math.floor(maxSilenceMs));
    return Array.from(trackedJobs.values()).filter((row) => {
      if (row.status !== 'active') return false;
      if (queueName !== undefined && row.queueName !== queueName) return false;
      const reference = toEpochMs(row.heartbeatAt) ?? toEpochMs(row.updatedAt);
      if (reference === null) return false;
      return reference <= threshold;
    });
  },

  getSummary(queueName?: string): Record<string, number> {
    const rows = Array.from(trackedJobs.values()).filter((row) =>
      queueName === undefined ? true : row.queueName === queueName
    );
    return rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.status;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  },

  reset(): void {
    trackedJobs.clear();
    transitions.splice(0, transitions.length);
    persistenceAdapter = null;
  },
});

export default JobStateTracker;
