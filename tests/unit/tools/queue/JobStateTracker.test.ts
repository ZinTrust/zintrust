import { beforeEach, describe, expect, it } from 'vitest';
import { JobStateTracker } from '@/tools/queue/JobStateTracker';

describe('JobStateTracker', () => {
  beforeEach(() => {
    JobStateTracker.reset();
  });

  it('tracks enqueue to completion lifecycle', async () => {
    await JobStateTracker.enqueued({
      queueName: 'emails',
      jobId: 'job-1',
      payload: { to: 'user@example.com' },
      maxAttempts: 3,
    });

    await JobStateTracker.started({
      queueName: 'emails',
      jobId: 'job-1',
      attempts: 1,
    });

    await JobStateTracker.completed({
      queueName: 'emails',
      jobId: 'job-1',
      processingTimeMs: 25,
      result: { ok: true },
    });

    const tracked = JobStateTracker.get('emails', 'job-1');
    expect(tracked?.status).toBe('completed');
    expect(tracked?.attempts).toBe(1);
    expect(tracked?.result).toEqual({ ok: true });

    const transitions = JobStateTracker.getTransitions({ queueName: 'emails', jobId: 'job-1' });
    expect(transitions.map((row) => row.toStatus)).toEqual(['pending', 'active', 'completed']);
  });

  it('tracks retryable failure as pending with retry time', async () => {
    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-2' });
    await JobStateTracker.started({ queueName: 'emails', jobId: 'job-2', attempts: 1 });

    const retryAt = new Date(Date.now() + 1000).toISOString();
    await JobStateTracker.failed({
      queueName: 'emails',
      jobId: 'job-2',
      attempts: 1,
      isFinal: false,
      retryAt,
      error: new Error('temporary'),
    });

    const tracked = JobStateTracker.get('emails', 'job-2');
    expect(tracked?.status).toBe('pending');
    expect(tracked?.lastError).toBe('temporary');
    expect(tracked?.retryAt).toBe(retryAt);
  });

  it('finds active and pending jobs older than threshold', async () => {
    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-3' });
    await JobStateTracker.started({ queueName: 'emails', jobId: 'job-3', attempts: 1 });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'job-4' });

    const oldActive = JobStateTracker.listActiveOlderThan(0, 'emails');
    const oldPending = JobStateTracker.listPendingOlderThan(0, 'emails');

    expect(oldActive.some((row) => row.jobId === 'job-3')).toBe(true);
    expect(oldPending.some((row) => row.jobId === 'job-4')).toBe(true);
  });

  it('tracks timeout/stalled/recovery flow and redacts sensitive payload fields', async () => {
    await JobStateTracker.enqueued({
      queueName: 'emails',
      jobId: 'job-5',
      payload: {
        token: 'secret-token-value',
        nested: { password: 'super-secret' },
      },
      maxAttempts: 3,
    });

    await JobStateTracker.started({
      queueName: 'emails',
      jobId: 'job-5',
      attempts: 1,
      timeoutMs: 1000,
      workerInstanceId: 'worker-a',
    });

    await JobStateTracker.heartbeat({
      queueName: 'emails',
      jobId: 'job-5',
      workerInstanceId: 'worker-a',
    });

    await JobStateTracker.timedOut({
      queueName: 'emails',
      jobId: 'job-5',
      reason: 'timed out in test',
    });

    await JobStateTracker.stalled({
      queueName: 'emails',
      jobId: 'job-5',
    });

    await JobStateTracker.markedRecovered({
      queueName: 'emails',
      jobId: 'job-5',
    });

    const tracked = JobStateTracker.get('emails', 'job-5');
    expect(tracked?.status).toBe('pending');
    expect((tracked?.payload as { token?: string })?.token).toBe('[REDACTED]');

    const recoverable = JobStateTracker.listRecoverable(0, 'emails');
    expect(recoverable.some((row) => row.jobId === 'job-5')).toBe(false);
  });
});
