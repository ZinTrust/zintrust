/* eslint-disable @typescript-eslint/no-explicit-any */
import { JobStateTracker } from '@queue/JobStateTracker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({ Logger: mockState.logger }));

describe('JobStateTracker uncovered branches', () => {
  beforeEach(() => {
    vi.stubEnv('JOB_TRACKING_ENABLED', 'true');
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', 'false');
    vi.stubEnv('JOB_TRACKING_MAX_JOBS', '20');
    vi.stubEnv('JOB_TRACKING_MAX_TRANSITIONS', '20');
    JobStateTracker.reset();
    mockState.logger.warn.mockReset();
  });

  afterEach(() => {
    JobStateTracker.reset();
    vi.unstubAllEnvs();
  });

  it('normalizes optional numeric inputs in every status method', async () => {
    await JobStateTracker.enqueued({
      queueName: 'q',
      jobId: 'numeric',
      attempts: 3,
      maxAttempts: 2.9,
      payload: { a: 1 },
      expectedCompletionAt: 'later',
      idempotencyKey: 'key',
    });
    await JobStateTracker.started({
      queueName: 'q',
      jobId: 'numeric',
      attempts: Number.POSITIVE_INFINITY,
      timeoutMs: Number.NaN,
    });
    await JobStateTracker.completed({ queueName: 'q', jobId: 'numeric' });
    await JobStateTracker.heartbeat({ queueName: 'q', jobId: 'numeric' });
    await JobStateTracker.timedOut({ queueName: 'q', jobId: 'numeric' });
    await JobStateTracker.stalled({ queueName: 'q', jobId: 'numeric' });
    await JobStateTracker.pendingRecovery({
      queueName: 'q',
      jobId: 'numeric',
      attempts: -3,
      maxAttempts: 0,
    });
    await JobStateTracker.markedRecovered({ queueName: 'q', jobId: 'numeric' });
    await JobStateTracker.handedOffToQueue({ queueName: 'q', jobId: 'numeric' });

    const record = JobStateTracker.get('q', 'numeric')!;
    expect(record.maxAttempts).toBe(2);
    expect(record.attempts).toBe(0);
    expect(record.status).toBe('enqueued');
    expect(record.idempotencyKey).toBe('key');
  });

  it('covers error normalization and code extraction branches', async () => {
    await JobStateTracker.failed({
      queueName: 'q',
      jobId: 'err',
      isFinal: true,
      error: Object.assign(new Error('bad secret token'), { code: ' AUTH_FAILED ' }),
    });
    expect(JobStateTracker.get('q', 'err')?.lastErrorCode).toBe('AUTH_FAILED');

    await JobStateTracker.failed({
      queueName: 'q',
      jobId: 'err',
      isFinal: false,
      attempts: 2,
      retryAt: 'soon',
      error: { code: 42 },
    });
    expect(JobStateTracker.get('q', 'err')?.status).toBe('pending');
    expect(JobStateTracker.get('q', 'err')?.retryAt).toBe('soon');
    expect(JobStateTracker.get('q', 'err')?.lastErrorCode).toBe('AUTH_FAILED');

    await JobStateTracker.timedOut({
      queueName: 'q',
      jobId: 'err',
      error: '   ',
      reason: 'custom timeout',
    });
    expect(JobStateTracker.get('q', 'err')?.lastError).toBe('custom timeout');

    await JobStateTracker.stalled({ queueName: 'q', jobId: 'err', reason: 'stalled reason' });
    await JobStateTracker.setTerminalStatus({
      queueName: 'q',
      jobId: 'err',
      status: 'dead_letter',
      reason: 'dead',
      error: 123,
    });
    await JobStateTracker.setTerminalStatus({
      queueName: 'q',
      jobId: 'err2',
      status: 'completed',
      reason: 'done',
      error: false,
    });

    const statuses = JobStateTracker.getSummary('q');
    expect(statuses['dead_letter']).toBe(1);
    expect(statuses['completed']).toBe(1);
  });

  it('persists records and transitions through a registered adapter', async () => {
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', 'true');
    const upsertJob = vi.fn(async () => undefined);
    const insertTransition = vi.fn(async () => undefined);
    JobStateTracker.registerPersistenceAdapter({ upsertJob, insertTransition });

    try {
      await JobStateTracker.enqueued({ queueName: 'q', jobId: 'p' });
      expect(upsertJob).toHaveBeenCalledTimes(1);
      expect(insertTransition).toHaveBeenCalledTimes(1);

      upsertJob.mockRejectedValueOnce(new Error('persist failed'));
      await JobStateTracker.started({ queueName: 'q', jobId: 'p' });
      expect(mockState.logger.warn).toHaveBeenCalledWith(
        'Job tracking persistence failed',
        expect.any(Object)
      );
    } finally {
      JobStateTracker.clearPersistenceAdapter();
    }
  });

  it('prunes tracked jobs and transitions at their configured limits', async () => {
    vi.stubEnv('JOB_TRACKING_MAX_JOBS', '1');
    vi.stubEnv('JOB_TRACKING_MAX_TRANSITIONS', '1');

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'a' });
    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'b' });

    expect(JobStateTracker.get('q', 'a')).toBeUndefined();
    expect(JobStateTracker.get('q', 'b')).toBeDefined();
    expect(JobStateTracker.getTransitions()).toHaveLength(1);
  });

  it('lists and filters records and transitions with invalid limits', async () => {
    await JobStateTracker.enqueued({ queueName: 'q1', jobId: 'a' });
    await JobStateTracker.started({ queueName: 'q1', jobId: 'a' });
    await JobStateTracker.enqueued({ queueName: 'q2', jobId: 'b' });

    expect(JobStateTracker.list({ queueName: 'q1', status: 'active', limit: -1 })).toHaveLength(1);
    expect(JobStateTracker.list({ queueName: 'missing' })).toEqual([]);
    expect(JobStateTracker.getTransitions({ queueName: 'q1', jobId: 'a', limit: 1 })).toHaveLength(
      1
    );
    expect(JobStateTracker.getTransitions({ queueName: 'q2', limit: Number.NaN })).toHaveLength(1);
    expect(JobStateTracker.getSummary()['active']).toBe(1);
    expect(JobStateTracker.getSummary('q1')['active']).toBe(1);
  });

  it('handles invalid timestamps in age-based list helpers', async () => {
    await JobStateTracker.started({ queueName: 'q', jobId: 'old' });
    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'pending' });
    await JobStateTracker.pendingRecovery({ queueName: 'q', jobId: 'recover' });

    const active = JobStateTracker.get('q', 'old')!;
    active.startedAt = ' ';
    active.updatedAt = 'not-a-date';
    active.heartbeatAt = undefined;
    expect(JobStateTracker.listActiveOlderThan(0, 'q')).toEqual([]);
    expect(JobStateTracker.listHeartbeatExpired(0, 'q')).toEqual([]);

    const pending = JobStateTracker.get('q', 'pending')!;
    pending.updatedAt = 'invalid';
    pending.createdAt = '';
    expect(JobStateTracker.listPendingOlderThan(0, 'q')).toEqual([]);

    const recover = JobStateTracker.get('q', 'recover')!;
    recover.updatedAt = 'invalid';
    expect(JobStateTracker.listRecoverable(0, 'q')).toEqual([]);

    recover.updatedAt = new Date(Date.now() - 5000).toISOString();
    await JobStateTracker.pendingRecovery({
      queueName: 'q',
      jobId: 'future',
      retryAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(JobStateTracker.listRecoverable(0, 'q').some((row) => row.jobId === 'future')).toBe(
      false
    );

    expect(JobStateTracker.listActiveOlderThan(0, 'other')).toEqual([]);
    expect(JobStateTracker.listPendingOlderThan(0, 'other')).toEqual([]);
    expect(JobStateTracker.listRecoverable(0, 'other')).toEqual([]);
    expect(JobStateTracker.listHeartbeatExpired(0, 'other')).toEqual([]);
  });

  it('is disabled when JOB_TRACKING_ENABLED is false', async () => {
    vi.stubEnv('JOB_TRACKING_ENABLED', 'false');
    expect(JobStateTracker.isEnabled()).toBe(false);

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.started({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.completed({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.failed({ queueName: 'q', jobId: 'skip', isFinal: true });
    await JobStateTracker.heartbeat({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.timedOut({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.stalled({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.pendingRecovery({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.markedRecovered({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.handedOffToQueue({ queueName: 'q', jobId: 'skip' });
    await JobStateTracker.setTerminalStatus({
      queueName: 'q',
      jobId: 'skip',
      status: 'failed',
      reason: 'skip',
    });

    expect(JobStateTracker.get('q', 'skip')).toBeUndefined();
  });
});
