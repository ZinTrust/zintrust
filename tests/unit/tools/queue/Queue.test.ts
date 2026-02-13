import { Env } from '@/config/env';
import { describe, expect, it, vi } from 'vitest';

describe('Queue', () => {
  it('preserves pending_recovery status when driver already marked fallback', async () => {
    Env.setSource({
      JOB_TRACKING_ENABLED: 'true',
    });
    vi.resetModules();
    const queueModule = await import('@/tools/queue/Queue');
    const trackerModule = await import('@/tools/queue/JobStateTracker');
    const Queue = queueModule.default;
    const { JobStateTracker } = trackerModule;

    JobStateTracker.reset();
    Queue.reset();

    Queue.register('test-driver', {
      async enqueue(queueName: string, payload: Record<string, unknown>): Promise<string> {
        const jobId = (payload['uniqueId'] as string) || 'fallback-job-id';
        await JobStateTracker.enqueued({
          queueName,
          jobId,
          payload,
        });
        await JobStateTracker.pendingRecovery({
          queueName,
          jobId,
          reason: 'Simulated HTTP proxy failure in driver',
          error: new Error('proxy down'),
        });
        return jobId;
      },
      async dequeue() {
        return undefined;
      },
      async ack() {
        return undefined;
      },
      async length() {
        return 0;
      },
      async drain() {
        return undefined;
      },
    });

    const jobId = await Queue.enqueue(
      'emails',
      {
        uniqueId: 'idempotent-fallback-job-1',
        attempts: 3,
      },
      'test-driver'
    );

    expect(jobId).toBe('idempotent-fallback-job-1');
    expect(JobStateTracker.get('emails', 'idempotent-fallback-job-1')?.status).toBe(
      'pending_recovery'
    );

    Env.setSource(null);
  });

  it('tracks failed enqueue attempts in memory as pending_recovery', async () => {
    Env.setSource({
      JOB_TRACKING_ENABLED: 'true',
    });
    vi.resetModules();
    const queueModule = await import('@/tools/queue/Queue');
    const trackerModule = await import('@/tools/queue/JobStateTracker');
    const Queue = queueModule.default;
    const { JobStateTracker } = trackerModule;

    JobStateTracker.reset();
    Queue.reset();

    Queue.register('failing-driver', {
      async enqueue(): Promise<string> {
        throw new Error('driver enqueue failed');
      },
      async dequeue() {
        return undefined;
      },
      async ack() {
        return undefined;
      },
      async length() {
        return 0;
      },
      async drain() {
        return undefined;
      },
    });

    await expect(
      Queue.enqueue(
        'emails',
        {
          uniqueId: 'failed-job-1',
          attempts: 2,
        },
        'failing-driver'
      )
    ).rejects.toThrow(/driver enqueue failed/);

    expect(JobStateTracker.get('emails', 'failed-job-1')?.status).toBe('pending_recovery');

    Env.setSource(null);
  });

  it('throws when asking for an unregistered driver', async () => {
    const Queue = (await import('@/tools/queue/Queue')).default;
    expect(() => Queue.get('this-driver-does-not-exist')).toThrow(
      /Queue driver not registered: this-driver-does-not-exist/
    );
  });

  it('returns cached lock prefix on subsequent calls', async () => {
    vi.resetModules();
    Env.setSource(null);
    const mod = await import('@/tools/queue/Queue');
    const first = mod.resolveLockPrefix();
    // Call it again to verify caching works
    const second = mod.resolveLockPrefix();
    // Both should return the same cached value (zintrust_zintrust_test_lock:)
    expect(first).toBe('zintrust_zintrust_test_lock:');
    expect(second).toBe('zintrust_zintrust_test_lock:');
    expect(first).toBe(second); // Verify they're the same (cached)
  });
});
