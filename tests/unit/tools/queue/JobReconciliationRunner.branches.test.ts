import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobReconciliationRunner, JobStateTracker } from '@/index';

describe('JobReconciliationRunner (branches)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.stubEnv('JOB_TRACKING_ENABLED', '1');
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '0');
    vi.stubEnv('QUEUE_JOB_TIMEOUT', '60');
    vi.stubEnv('JOB_HEARTBEAT_GRACE_MS', '20000');

    JobStateTracker.reset();
  });

  afterEach(() => {
    JobStateTracker.reset();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('reconcileFromPersistence returns 0 when persistence disabled', async () => {
    const count = await JobReconciliationRunner.reconcileFromPersistence(10);
    expect(count).toBe(0);
  });

  it('reconcileInMemory marks stalled and timeout based on timestamps', async () => {
    // Note: reconciliation first marks stale heartbeats as stalled, then marks *remaining*
    // active jobs that exceed timeout as timed out. A single job cannot be counted in both
    // buckets in the same run.

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'stalled' });
    await JobStateTracker.started({ queueName: 'q', jobId: 'stalled', attempts: 1 });

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'timedout' });
    await JobStateTracker.started({ queueName: 'q', jobId: 'timedout', attempts: 1 });

    const stalledRec = JobStateTracker.get('q', 'stalled');
    expect(stalledRec).toBeDefined();
    if (stalledRec) {
      stalledRec.heartbeatAt = '2025-12-31T00:00:00.000Z';
      stalledRec.updatedAt = '2025-12-31T00:00:00.000Z';
    }

    const timedOutRec = JobStateTracker.get('q', 'timedout');
    expect(timedOutRec).toBeDefined();
    if (timedOutRec) {
      timedOutRec.startedAt = '2025-12-31T00:00:00.000Z';
      timedOutRec.heartbeatAt = '2026-01-01T00:00:00.000Z';
      timedOutRec.updatedAt = '2025-12-31T00:00:00.000Z';
    }

    const out = await JobReconciliationRunner.reconcileInMemory();
    expect(out.stalled).toBe(1);
    expect(out.timeout).toBe(1);

    expect(JobStateTracker.get('q', 'stalled')?.status).toBe('stalled');
    expect(JobStateTracker.get('q', 'timedout')?.status).toBe('timeout');
  });
});
