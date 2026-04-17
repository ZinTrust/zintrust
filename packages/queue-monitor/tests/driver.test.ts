import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn();
const closeMock = vi.fn(async () => undefined);
const getJobMock = vi.fn();
const getJobsMock = vi.fn(async () => []);
const getJobCountsMock = vi.fn(async () => ({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
}));

vi.mock('@zintrust/core', () => ({
  ErrorFactory: {
    createTryCatchError: (message: string) => new Error(message),
  },
  getBullMQSafeQueueName: () => 'zintrust',
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    getJob = getJobMock;
    getJobs = getJobsMock;
    getJobCounts = getJobCountsMock;
    close = closeMock;
  },
}));

vi.mock('../src/connection', () => ({
  createRedisConnection: vi.fn(() => ({
    scan: vi.fn(async () => ['0', []]),
  })),
}));

import { createBullMQDriver } from '../src/driver';

describe('queue-monitor driver retryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns missing when the live job record no longer exists', async () => {
    getJobMock.mockResolvedValueOnce(undefined);

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.retryJob('emails', 'job-1')).resolves.toEqual({
      ok: false,
      status: 'missing',
    });
  });

  it('returns not_retryable with a reason when BullMQ rejects retry', async () => {
    getJobMock.mockResolvedValueOnce({
      retry: vi.fn(async () => {
        throw new Error('Job is not in a failed state');
      }),
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.retryJob('emails', 'job-2')).resolves.toEqual({
      ok: false,
      status: 'not_retryable',
      reason: 'Job is not in a failed state',
    });
  });

  it('returns retried when BullMQ accepts the retry request', async () => {
    getJobMock.mockResolvedValueOnce({
      retry: vi.fn(async () => undefined),
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.retryJob('emails', 'job-3')).resolves.toEqual({
      ok: true,
      status: 'retried',
    });
  });
});
