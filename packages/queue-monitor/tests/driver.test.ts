import { ErrorFactory } from '@zintrust/core';
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
const queueClientSetMock = vi.fn(async () => 'OK');

vi.mock('@zintrust/core', () => ({
  ErrorFactory: {
    createTryCatchError: (message: string) => new Error(message),
  },
  getBullMQSafeQueueName: () => 'zintrust',
}));

vi.mock('@zintrust/core/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    getBackend = () => ({
      client: Promise.resolve({ set: queueClientSetMock }),
    });
    getJob = getJobMock;
    getJobs = getJobsMock;
    getJobCounts = getJobCountsMock;
    toKey = (suffix: string) => `zintrust:emails:${suffix}`;
    close = closeMock;
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

vi.mock('../src/connection', () => ({
  createRedisConnection: vi.fn(() => ({
    scan: vi.fn(async () => ['0', []]),
    pipeline: undefined,
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

  it('returns requeued_from_snapshot when the live job is gone but a retry snapshot exists', async () => {
    getJobMock.mockResolvedValueOnce(undefined);
    addMock.mockResolvedValueOnce({ id: 'job-4b' });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(
      driver.retryJob('emails', 'job-4', {
        name: 'email-job',
        data: { userId: 'u-1' },
        opts: { attempts: 3 },
      })
    ).resolves.toEqual({
      ok: true,
      status: 'requeued_from_snapshot',
      newJobId: 'job-4b',
    });
    expect(addMock).toHaveBeenCalledWith('email-job', { userId: 'u-1' }, { attempts: 3 });
  });

  it('returns not_retryable when snapshot requeue fails', async () => {
    getJobMock.mockResolvedValueOnce(undefined);
    addMock.mockRejectedValueOnce(new Error('Redis unavailable'));

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(
      driver.retryJob('emails', 'job-5', {
        name: 'email-job',
        data: { userId: 'u-2' },
      })
    ).resolves.toEqual({
      ok: false,
      status: 'not_retryable',
      reason: 'Redis unavailable',
    });
  });

  it('returns not_retryable with a reason when BullMQ rejects retry', async () => {
    getJobMock.mockResolvedValueOnce({
      retry: vi.fn(async () => {
        throw ErrorFactory.createTryCatchError('Job is not in a failed state');
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

describe('queue-monitor driver recoverActiveJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns missing when the job does not exist', async () => {
    getJobMock.mockResolvedValueOnce(undefined);

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.recoverActiveJob('emails', 'job-1')).resolves.toEqual({
      ok: false,
      status: 'missing',
    });
  });

  it('returns not_active when the job is no longer active', async () => {
    getJobMock.mockResolvedValueOnce({
      getState: vi.fn(async () => 'failed'),
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.recoverActiveJob('emails', 'job-2')).resolves.toEqual({
      ok: false,
      status: 'not_active',
      reason: 'Job is failed, not active',
    });
  });

  it('recreates the pull-worker lock and fails active jobs', async () => {
    const moveToFailed = vi.fn(async () => undefined);
    getJobMock.mockResolvedValueOnce({
      getState: vi.fn(async () => 'active'),
      moveToFailed,
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.recoverActiveJob('emails', 'job-3')).resolves.toEqual({
      ok: true,
      status: 'failed',
    });

    expect(queueClientSetMock).toHaveBeenCalledWith(
      'zintrust:emails:job-3:lock',
      'pull-worker',
      'PX',
      '30000'
    );
    expect(moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
  });
});

describe('queue-monitor driver getJobCountsMany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(driver.getJobCountsMany([])).resolves.toEqual([]);
  });

  it('returns empty array for only invalid queue names', async () => {
    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    await expect(
      driver.getJobCountsMany(['', '  ', null as unknown as string, undefined as unknown as string])
    ).resolves.toEqual([]);
  });

  it('deduplicates queue names', async () => {
    getJobCountsMock.mockResolvedValue({
      waiting: 5,
      active: 2,
      completed: 10,
      failed: 1,
      delayed: 0,
      paused: 0,
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    const result = await driver.getJobCountsMany(['emails', 'emails', 'emails']);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'emails',
      counts: {
        waiting: 5,
        active: 2,
        completed: 10,
        failed: 1,
        delayed: 0,
        paused: 0,
      },
    });
    expect(getJobCountsMock).toHaveBeenCalledTimes(1);
  });

  it('fetches counts for multiple unique queues', async () => {
    getJobCountsMock
      .mockResolvedValueOnce({
        waiting: 5,
        active: 2,
        completed: 10,
        failed: 1,
        delayed: 0,
        paused: 0,
      })
      .mockResolvedValueOnce({
        waiting: 3,
        active: 1,
        completed: 5,
        failed: 0,
        delayed: 0,
        paused: 0,
      });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    const result = await driver.getJobCountsMany(['emails', 'notifications']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'emails',
      counts: {
        waiting: 5,
        active: 2,
        completed: 10,
        failed: 1,
        delayed: 0,
        paused: 0,
      },
    });
    expect(result[1]).toEqual({
      name: 'notifications',
      counts: {
        waiting: 3,
        active: 1,
        completed: 5,
        failed: 0,
        delayed: 0,
        paused: 0,
      },
    });
    expect(getJobCountsMock).toHaveBeenCalledTimes(2);
  });

  it('filters out invalid queue names while processing valid ones', async () => {
    getJobCountsMock.mockResolvedValue({
      waiting: 5,
      active: 2,
      completed: 10,
      failed: 1,
      delayed: 0,
      paused: 0,
    });

    const driver = createBullMQDriver({ host: 'localhost', port: 6379 });
    const result = await driver.getJobCountsMany(['emails', '', '  ', 'notifications']);

    expect(result).toHaveLength(2);
    expect(getJobCountsMock).toHaveBeenCalledTimes(2);
  });
});
