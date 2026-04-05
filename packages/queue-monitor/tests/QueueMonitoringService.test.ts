import { describe, expect, it, vi } from 'vitest';
import { ALL_QUEUES, getRecentJobsForSelection } from '../src/QueueMonitoringService';
import type { QueueDriver } from '../src/driver';
import type { Metrics } from '../src/metrics';

describe('QueueMonitoringService', () => {
  it('aggregates recent jobs across all queues when the All queues selection is used', async () => {
    const metrics: Metrics = {
      recordJob: vi.fn(async () => undefined),
      getStats: vi.fn(async () => []),
      getRecentJobs: vi.fn(async (queue: string) =>
        queue === 'alpha'
          ? [{ id: 'a1', name: 'job-a', queue: 'alpha', data: {}, attempts: 1, timestamp: 10 }]
          : [{ id: 'b1', name: 'job-b', queue: 'beta', data: {}, attempts: 1, timestamp: 20 }]
      ),
      getFailedJobs: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };

    const driver: QueueDriver = {
      enqueue: vi.fn(async () => '1'),
      getJob: vi.fn(async () => undefined),
      getJobCounts: vi.fn(async () => ({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      })),
      getRecentJobs: vi.fn(async () => []),
      retryJob: vi.fn(async () => true),
      getQueues: vi.fn(async () => ['alpha', 'beta']),
      close: vi.fn(async () => undefined),
    };

    const jobs = await getRecentJobsForSelection(ALL_QUEUES, metrics, driver, ['alpha', 'beta']);

    expect(jobs.map((job) => job.id)).toEqual(['b1', 'a1']);
    expect(jobs.map((job) => job.queue)).toEqual(['beta', 'alpha']);
  });

  it('falls back to retained driver jobs when metrics history is empty for a queue', async () => {
    const metrics: Metrics = {
      recordJob: vi.fn(async () => undefined),
      getStats: vi.fn(async () => []),
      getRecentJobs: vi.fn(async () => []),
      getFailedJobs: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };

    const driverRecentJobs = vi.fn(async () => [
      {
        id: 'retained-1',
        name: 'smartq-job',
        data: { smartId: '12dcdb41-01a0-4ac5-ba1f-5956d01d2f10' },
        attemptsMade: 1,
        timestamp: 100,
        processedOn: 110,
        finishedOn: 125,
        failedReason: undefined,
        _state: 'completed',
      },
      {
        id: 'retained-2',
        name: 'asset-hold-job',
        data: { holdId: 'hold-1' },
        attemptsMade: 2,
        timestamp: 90,
        processedOn: 95,
        finishedOn: 120,
        failedReason: 'wallet mismatch',
        _state: 'failed',
      },
    ]);

    const driver: QueueDriver = {
      enqueue: vi.fn(async () => '1'),
      getJob: vi.fn(async () => undefined),
      getJobCounts: vi.fn(async () => ({
        waiting: 0,
        active: 0,
        completed: 1,
        failed: 1,
        delayed: 0,
        paused: 0,
      })),
      getRecentJobs: driverRecentJobs,
      retryJob: vi.fn(async () => true),
      getQueues: vi.fn(async () => ['smartq']),
      close: vi.fn(async () => undefined),
    };

    const jobs = await getRecentJobsForSelection('smartq', metrics, driver);

    expect(driverRecentJobs).toHaveBeenCalledWith('smartq', 100);
    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'retained-1',
        queue: 'smartq',
        status: 'completed',
        processedOn: 110,
        finishedOn: 125,
      }),
      expect.objectContaining({
        id: 'retained-2',
        queue: 'smartq',
        status: 'failed',
        failedReason: 'wallet mismatch',
      }),
    ]);
  });
});
