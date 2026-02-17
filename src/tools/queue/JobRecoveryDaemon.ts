import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import { JobStateTracker, type JobTrackingRecord } from '@queue/JobStateTracker';
import { Queue } from '@queue/Queue';

const parsePayload = (payload: unknown): Record<string, unknown> => {
  if (payload !== null && payload !== undefined && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  return { payload };
};

const shouldManualReview = (record: JobTrackingRecord): boolean => {
  const error = String(record.lastError ?? '').toLowerCase();
  return error.includes('fatal') || error.includes('corrupt');
};

export type DlqReplayReasonCode = 'bug_fixed' | 'transient_dependency' | 'operator_override';

type DlqReplayRequest = {
  reasonCode: DlqReplayReasonCode;
  replayedBy: string;
  queueName?: string;
  limit?: number;
  maxPerSecond?: number;
  minAgeMs?: number;
};

type DlqReplayResult = {
  scanned: number;
  replayed: number;
  skipped: number;
};

const replayReasonCodes = new Set<DlqReplayReasonCode>([
  'bug_fixed',
  'transient_dependency',
  'operator_override',
]);

const resolveLimit = (requested?: number): number => {
  const maxBatch = Math.max(1, Env.getInt('DLQ_REPLAY_MAX_BATCH_SIZE', 25));
  if (typeof requested !== 'number' || Number.isFinite(requested) === false || requested <= 0) {
    return maxBatch;
  }
  return Math.min(maxBatch, Math.floor(requested));
};

const resolveRate = (requested?: number): number => {
  const maxQps = Math.max(1, Env.getInt('DLQ_REPLAY_MAX_QPS', 5));
  if (typeof requested !== 'number' || Number.isFinite(requested) === false || requested <= 0) {
    return maxQps;
  }
  return Math.min(maxQps, Math.floor(requested));
};

const resolveMinAgeMs = (requested?: number): number => {
  const minAllowed = Math.max(0, Env.getInt('DLQ_REPLAY_MIN_AGE_MS', 60000));
  if (typeof requested !== 'number' || Number.isFinite(requested) === false || requested < 0) {
    return minAllowed;
  }
  return Math.max(minAllowed, Math.floor(requested));
};

const validateReplayReasonCode = (reasonCode: DlqReplayReasonCode): void => {
  if (replayReasonCodes.has(reasonCode)) return;
  throw ErrorFactory.createConfigError(`Unsupported DLQ replay reason code: ${reasonCode}`);
};

const validateReplayActor = (replayedBy: string): void => {
  if (replayedBy.trim().length === 0) {
    throw ErrorFactory.createConfigError('DLQ replay actor is required');
  }

  const allowedActorsRaw = Env.get('DLQ_REPLAY_ALLOWED_ACTORS', '').trim();
  if (allowedActorsRaw.length === 0) return;

  const allowedActors = allowedActorsRaw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (allowedActors.length === 0) return;
  if (allowedActors.includes(replayedBy.trim())) return;

  throw ErrorFactory.createConfigError(`DLQ replay actor is not allowed: ${replayedBy}`);
};

const isReplayEligible = (record: JobTrackingRecord, minAgeMs: number): boolean => {
  if (record.status !== 'dead_letter') return false;
  const updated = new Date(record.updatedAt).getTime();
  if (Number.isNaN(updated)) return false;
  return updated <= Date.now() - minAgeMs;
};

const toReplayPayload = (
  record: JobTrackingRecord,
  reasonCode: DlqReplayReasonCode,
  replayedBy: string
): Record<string, unknown> => {
  const parsed = parsePayload(record.payload);
  const lineage = {
    originalJobId: record.jobId,
    replayReasonCode: reasonCode,
    replayedBy,
    replayedAt: new Date().toISOString(),
  };

  const existingLineage = parsed['__dlqReplayLineage'];
  const lineageArray = Array.isArray(existingLineage)
    ? [...existingLineage.map((entry) => ({ ...(entry as Record<string, unknown>) })), lineage]
    : [lineage];

  return {
    ...parsed,
    __dlqReplayLineage: lineageArray,
  };
};

export const JobRecoveryDaemon = Object.freeze({
  async recoverOne(
    record: JobTrackingRecord
  ): Promise<'requeued' | 'dead_letter' | 'manual_review'> {
    const maxAttempts = typeof record.maxAttempts === 'number' ? record.maxAttempts : 3;
    if (record.attempts >= maxAttempts) {
      await JobStateTracker.setTerminalStatus({
        queueName: record.queueName,
        jobId: record.jobId,
        status: 'dead_letter',
        reason: 'Max retry attempts reached during recovery',
      });
      return 'dead_letter';
    }

    if (shouldManualReview(record)) {
      await JobStateTracker.setTerminalStatus({
        queueName: record.queueName,
        jobId: record.jobId,
        status: 'manual_review',
        reason: 'Fatal recovery signature detected',
      });
      return 'manual_review';
    }

    const payload = parsePayload(record.payload);

    // 30s, 1m, 3m backoff strategy
    const getBackoffMs = (attempt: number): number => {
      if (attempt === 0) return 30000;
      if (attempt === 1) return 60000;
      return 180000;
    };
    const backoffMs = getBackoffMs(record.attempts);

    try {
      await Queue.enqueue(record.queueName, {
        ...payload,
        uniqueId: record.jobId, // Preserves job ID (prevents duplication)
        attempts: maxAttempts,
        _currentAttempts: record.attempts + 1,
        timestamp: Date.now() + backoffMs,
      });

      // Once the job is in QUEUE_DRIVER (or already exists), we never re-enqueue from DB/recovery again.
      await JobStateTracker.handedOffToQueue({
        queueName: record.queueName,
        jobId: record.jobId,
        reason: 'Enqueue-fallback job handed off to QUEUE_DRIVER',
      });

      return 'requeued';
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const message = errorMessage.toLowerCase();
      if (message.includes('jobid') && message.includes('already exists')) {
        await JobStateTracker.handedOffToQueue({
          queueName: record.queueName,
          jobId: record.jobId,
          reason: 'Job already exists in queue driver',
        });
        return 'requeued';
      }

      await JobStateTracker.pendingRecovery({
        queueName: record.queueName,
        jobId: record.jobId,
        reason: 'Enqueue-fallback retry failed during recovery daemon run',
        attempts: record.attempts + 1,
        maxAttempts,
        retryAt: new Date(Date.now() + backoffMs).toISOString(),
        error,
      });

      throw error;
    }
  },

  async runOnce(): Promise<{
    scanned: number;
    requeued: number;
    deadLetter: number;
    manualReview: number;
  }> {
    const minAgeMs = Math.max(0, Env.getInt('JOB_RECOVERY_MIN_AGE_MS', 5000));
    const candidates = JobStateTracker.listRecoverable(minAgeMs);
    const persisted = await listRecoverableFromPersistence(minAgeMs);

    // De-dupe jobs that exist in both in-memory tracker and persistence.
    const seen = new Set<string>();
    const allCandidates = [...candidates, ...persisted].filter((row) => {
      const key = `${row.queueName}:${row.jobId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let requeued = 0;
    let deadLetter = 0;
    let manualReview = 0;

    const concurrency = 10;
    const batches: Array<Promise<Array<'requeued' | 'dead_letter' | 'manual_review'>>> = [];

    for (let offset = 0; offset < allCandidates.length; offset += concurrency) {
      const slice = allCandidates.slice(offset, offset + concurrency);
      batches.push(Promise.all(slice.map(async (candidate) => this.recoverOne(candidate))));
    }

    const batchResults = await Promise.all(batches);
    batchResults.flat().forEach((result) => {
      if (result === 'requeued') requeued += 1;
      if (result === 'dead_letter') deadLetter += 1;
      if (result === 'manual_review') manualReview += 1;
    });

    if (allCandidates.length > 0) {
      Logger.info('Queue recovery daemon completed scan', {
        scanned: allCandidates.length,
        requeued,
        deadLetter,
        manualReview,
      });
    }

    return {
      scanned: allCandidates.length,
      requeued,
      deadLetter,
      manualReview,
    };
  },

  async replayDeadLetter(input: DlqReplayRequest): Promise<DlqReplayResult> {
    validateReplayReasonCode(input.reasonCode);
    validateReplayActor(input.replayedBy);

    const limit = resolveLimit(input.limit);
    const maxPerSecond = resolveRate(input.maxPerSecond);
    const minAgeMs = resolveMinAgeMs(input.minAgeMs);
    const replayBudget = Math.max(1, maxPerSecond);

    const candidates = JobStateTracker.list({
      queueName: input.queueName,
      status: 'dead_letter',
      limit,
    })
      .filter((record) => isReplayEligible(record, minAgeMs))
      .slice(0, replayBudget);

    let replayed = 0;
    let skipped = 0;

    await candidates.reduce<Promise<void>>(async (chain, candidate) => {
      await chain;

      if (candidate.queueName.trim().length === 0) {
        skipped += 1;
        return;
      }

      const replayPayload = toReplayPayload(candidate, input.reasonCode, input.replayedBy.trim());
      const replayJobId = await Queue.enqueue(candidate.queueName, replayPayload);

      await JobStateTracker.setTerminalStatus({
        queueName: candidate.queueName,
        jobId: candidate.jobId,
        status: 'dead_letter',
        reason: `DLQ replayed (${input.reasonCode}) by ${input.replayedBy.trim()} as ${replayJobId}`,
      });

      replayed += 1;
    }, Promise.resolve());

    Logger.info('DLQ replay governance batch completed', {
      scanned: candidates.length,
      replayed,
      skipped,
      reasonCode: input.reasonCode,
      replayedBy: input.replayedBy.trim(),
      queueName: input.queueName,
      limit,
      maxPerSecond,
      minAgeMs,
    });

    return {
      scanned: candidates.length,
      replayed,
      skipped,
    };
  },
});

type PersistedRecoverableRow = {
  queue_name: string;
  job_id: string;
  attempts?: number;
  max_attempts?: number;
  payload_json?: string | null;
  retry_at?: string | null;
  updated_at?: string | null;
};

const toSqlDateTime = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');

const getPersistenceDb = (): IDatabase =>
  useDatabase(undefined, Env.get('JOB_TRACKING_DB_CONNECTION', 'default'));

const listRecoverableFromPersistence = async (minAgeMs: number): Promise<JobTrackingRecord[]> => {
  if (!Env.getBool('JOB_TRACKING_PERSISTENCE_ENABLED', false)) return [];

  const db = getPersistenceDb();
  const cutoff = new Date(Date.now() - Math.max(0, Math.floor(minAgeMs)));

  const rows = await db
    .table(Env.get('JOB_TRACKING_DB_TABLE', 'zintrust_jobs'))
    .select(
      'queue_name',
      'job_id',
      'attempts',
      'max_attempts',
      'payload_json',
      'retry_at',
      'updated_at'
    )
    .where('status', '=', 'pending_recovery')
    .where('updated_at', '<=', toSqlDateTime(cutoff))
    .limit(Math.max(1, Env.getInt('JOB_RECOVERY_DB_SCAN_LIMIT', 100)))
    .get<PersistedRecoverableRow>();

  return (rows ?? []).map((row) => {
    let payload: unknown = {};
    try {
      payload = JSON.parse(String(row.payload_json ?? '{}'));
    } catch {
      payload = {};
    }

    const attempts =
      typeof row.attempts === 'number' && Number.isFinite(row.attempts)
        ? Math.max(0, Math.floor(row.attempts))
        : 0;

    const maxAttempts =
      typeof row.max_attempts === 'number' && Number.isFinite(row.max_attempts)
        ? Math.max(1, Math.floor(row.max_attempts))
        : undefined;

    const updatedAtRaw = typeof row.updated_at === 'string' ? row.updated_at : undefined;
    const updatedAt =
      updatedAtRaw !== undefined && updatedAtRaw.trim().length > 0
        ? updatedAtRaw
        : new Date(0).toISOString();

    const retryAtRaw = typeof row.retry_at === 'string' ? row.retry_at : undefined;
    const retryAt =
      retryAtRaw !== undefined && retryAtRaw.trim().length > 0 ? retryAtRaw : undefined;

    return {
      queueName: String(row.queue_name),
      jobId: String(row.job_id),
      status: 'pending_recovery',
      attempts,
      maxAttempts,
      createdAt: new Date().toISOString(),
      updatedAt,
      payload,
      retryAt,
    } satisfies JobTrackingRecord;
  });
};

export default JobRecoveryDaemon;
