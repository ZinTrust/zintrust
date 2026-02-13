import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
    const backoffMs = Math.min(300000, Math.max(1000, 1000 * 2 ** Math.max(0, record.attempts)));

    await Queue.enqueue(record.queueName, {
      ...payload,
      attempts: Math.max(0, record.attempts),
      timestamp: Date.now() + backoffMs,
    });

    await JobStateTracker.markedRecovered({
      queueName: record.queueName,
      jobId: record.jobId,
      reason: 'Recovered and re-queued by recovery daemon',
      retryAt: new Date(Date.now() + backoffMs).toISOString(),
    });

    return 'requeued';
  },

  async runOnce(): Promise<{
    scanned: number;
    requeued: number;
    deadLetter: number;
    manualReview: number;
  }> {
    const minAgeMs = Math.max(0, Env.getInt('JOB_RECOVERY_MIN_AGE_MS', 5000));
    const candidates = JobStateTracker.listRecoverable(minAgeMs);

    let requeued = 0;
    let deadLetter = 0;
    let manualReview = 0;

    const results = await Promise.all(
      candidates.map(async (candidate) => this.recoverOne(candidate))
    );
    results.forEach((result) => {
      if (result === 'requeued') requeued += 1;
      if (result === 'dead_letter') deadLetter += 1;
      if (result === 'manual_review') manualReview += 1;
    });

    if (candidates.length > 0) {
      Logger.info('Queue recovery daemon completed scan', {
        scanned: candidates.length,
        requeued,
        deadLetter,
        manualReview,
      });
    }

    return {
      scanned: candidates.length,
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

export default JobRecoveryDaemon;
