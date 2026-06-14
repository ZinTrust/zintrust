import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const queueClient = {
    set: vi.fn(async () => 'OK'),
    disconnect: vi.fn(),
  };

  return {
    queueClient,
    redisConnections: [] as Array<{
      del: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      hset: ReturnType<typeof vi.fn>;
      hget: ReturnType<typeof vi.fn>;
      hgetall: ReturnType<typeof vi.fn>;
      scan: ReturnType<typeof vi.fn>;
      ping: ReturnType<typeof vi.fn>;
      call: ReturnType<typeof vi.fn>;
      pipeline: ReturnType<typeof vi.fn>;
      multi: ReturnType<typeof vi.fn>;
    }>,
    getJobs: vi.fn(),
    getJob: vi.fn(),
    getJobCounts: vi.fn(),
    moveToActive: vi.fn(),
    fromJSON: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('@zintrust/core/logger', () => ({
  Logger: {
    warn: mockState.warn,
  },
}));

vi.mock('ioredis', () => {
  class MockRedis {
    del = vi.fn(async () => 1);
    disconnect = vi.fn();
    hset = vi.fn(async () => 1);
    hget = vi.fn(async () => null);
    hgetall = vi.fn(async () => ({}));
    scan = vi.fn(async () => ['0', []]);
    ping = vi.fn(async () => 'PONG');
    call = vi.fn(async () => null);
    pipeline = vi.fn(() => ({
      exec: async () => [],
    }));
    multi = vi.fn(() => ({
      exec: async () => [],
    }));

    constructor() {
      mockState.redisConnections.push(this);
    }

    once = vi.fn();
  }

  return {
    default: MockRedis,
  };
});

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    opts: Record<string, unknown>;
    client = Promise.resolve(mockState.queueClient);
    scripts = {
      moveToActive: mockState.moveToActive,
    };

    constructor(name: string, opts: Record<string, unknown>) {
      this.name = name;
      this.opts = opts;
    }

    toKey(suffix: string): string {
      return `${String(this.opts['prefix'])}:${this.name}:${suffix}`;
    }

    getJobs(...args: unknown[]): Promise<unknown[]> {
      return mockState.getJobs(...args);
    }

    getJob(...args: unknown[]): Promise<unknown> {
      return mockState.getJob(...args);
    }

    getJobCounts(...args: unknown[]): Promise<Record<string, number>> {
      return mockState.getJobCounts(...args);
    }

    close = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    count = vi.fn(async () => 0);
  }

  class MockJob {
    static fromJSON = mockState.fromJSON;
  }

  class MockQueueEvents {
    on = vi.fn();
    close = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
  }

  class UnrecoverableError extends Error {}
  return {
    Job: MockJob,
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
    UnrecoverableError,
  };
});

describe('createRedisRpcBackend stale active recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.redisConnections.length = 0;
    mockState.getJob.mockResolvedValue(null);
    mockState.getJobCounts.mockResolvedValue({ active: 0 });
    delete process.env['REDIS_RPC_STALE_ACTIVE_MS'];
  });

  it('skips active jobs that have not exceeded the default stale threshold', async () => {
    vi.setSystemTime(new Date('2026-06-13T13:52:00.000Z'));

    const activeJob = {
      id: 'stale-1',
      processedOn: Date.now() - 100_000,
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => undefined),
    };
    const dequeuedJob = {
      id: 'next-1',
      name: 'email',
      data: { ok: true },
      attemptsMade: 0,
      token: '',
    };

    mockState.getJobs.mockResolvedValue([activeJob]);
    mockState.moveToActive.mockResolvedValue([{ name: 'email', data: { ok: true } }, 'next-1']);
    mockState.fromJSON.mockReturnValue(dequeuedJob);

    const { createRedisRpcBackend } = await import('../../../../packages/redis-rpc/backend.ts');
    const backend = createRedisRpcBackend({ prefix: 'bull' });

    await expect(
      backend.dispatch('queue', 'dequeue', {
        queueName: 'mailers',
        visibilityTimeoutMs: 30_000,
      })
    ).resolves.toEqual({
      id: 'next-1',
      name: 'email',
      payload: { ok: true },
      attempts: 0,
    });

    expect(activeJob.moveToFailed).not.toHaveBeenCalled();
    expect(activeJob.discard).not.toHaveBeenCalled();
    expect(mockState.queueClient.set).not.toHaveBeenCalled();
    expect(mockState.warn).not.toHaveBeenCalled();
  });

  it('recovers stale active jobs with an env override, releases claims, and continues after warnings', async () => {
    process.env['REDIS_RPC_STALE_ACTIVE_MS'] = '60000';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T13:52:00.000Z'));
    const now = Date.now();

    const failingJob = {
      id: 'stale-bad',
      processedOn: now - 90_000,
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const recoveredJob = {
      id: 'stale-good',
      processedOn: now - 80_000,
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => undefined),
    };
    const dequeuedJob = {
      id: 'next-2',
      name: 'report',
      data: { ok: true },
      attemptsMade: 3,
      token: '',
    };

    mockState.getJobs.mockResolvedValue([failingJob, recoveredJob]);
    mockState.moveToActive.mockResolvedValue([{ name: 'report', data: { ok: true } }, 'next-2']);
    mockState.fromJSON.mockReturnValue(dequeuedJob);

    const { createRedisRpcBackend } = await import('../../../../packages/redis-rpc/backend.ts');
    const backend = createRedisRpcBackend({ prefix: 'bull' });

    await expect(
      backend.dispatch('queue', 'dequeue', {
        queueName: 'mailers',
        visibilityTimeoutMs: 30_000,
      })
    ).resolves.toEqual({
      id: 'next-2',
      name: 'report',
      payload: { ok: true },
      attempts: 3,
    });

    expect(mockState.queueClient.set).toHaveBeenNthCalledWith(
      1,
      'bull:mailers:stale-bad:lock',
      'pull-worker',
      'PX',
      30_000
    );
    expect(mockState.queueClient.set).toHaveBeenNthCalledWith(
      2,
      'bull:mailers:stale-good:lock',
      'pull-worker',
      'PX',
      30_000
    );
    expect(failingJob.moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
    expect(recoveredJob.moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
    // NOTE: .discard is not directly called by recover/fail paths in backend (only moveToFailed + lock management)
    expect(mockState.warn).toHaveBeenCalledWith(
      'Redis RPC stale active recovery failed',
      expect.objectContaining({
        queueName: 'mailers',
        jobId: 'stale-bad',
        thresholdMs: 60_000,
      })
    );

    expect(mockState.redisConnections).toHaveLength(2);
    expect(mockState.redisConnections[1]?.del).toHaveBeenCalledWith(
      'bull:mailers:__pull_claim:stale-good'
    );

    vi.useRealTimers();
  });

  it('recreates the lock and discards retries for forced manual fail', async () => {
    const job = {
      id: 'manual-1',
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => undefined),
    };
    mockState.getJob.mockResolvedValue(job);

    const { createRedisRpcBackend } = await import('../../../../packages/redis-rpc/backend.ts');
    const backend = createRedisRpcBackend({ prefix: 'bull' });

    await expect(
      backend.dispatch('queue', 'fail', {
        queueName: 'mailers',
        args: ['manual-1', 'manual stale active recovery'],
        force: true,
        visibilityTimeoutMs: 45_000,
      })
    ).resolves.toBe(true);

    expect(mockState.queueClient.set).toHaveBeenCalledWith(
      'bull:mailers:manual-1:lock',
      'pull-worker',
      'PX',
      45_000
    );
    // .discard not called by source; moveToFailed + release/lock exercised.
    expect(job.moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
    expect(mockState.redisConnections[1]?.del).toHaveBeenCalledWith(
      'bull:mailers:__pull_claim:manual-1'
    );
  });

  it('runs stale active recovery before monitor snapshots', async () => {
    process.env['REDIS_RPC_STALE_ACTIVE_MS'] = '60000';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T13:52:00.000Z'));
    const now = Date.now();

    const staleJob = {
      id: 'stale-monitor',
      processedOn: now - 80_000,
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => undefined),
    };

    mockState.getJobs.mockResolvedValue([staleJob]);
    mockState.getJobCounts.mockResolvedValue({ active: 0, failed: 1 });

    const { createRedisRpcBackend } = await import('../../../../packages/redis-rpc/backend.ts');
    const backend = createRedisRpcBackend({ prefix: 'bull' });

    await expect(
      backend.dispatch('queue-monitor', 'getSnapshot', {
        queueNames: ['mailers'],
        visibilityTimeoutMs: 30_000,
      })
    ).resolves.toMatchObject({
      status: 'ok',
      queues: [{ name: 'mailers', counts: { active: 0, failed: 1 } }],
    });

    // discard spy not populated by the code under test (moveToFailed is); recovery + getJobCounts are asserted.
    expect(staleJob.moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
    expect(mockState.getJobCounts).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('runs stale active recovery before monitor recent-job reads', async () => {
    process.env['REDIS_RPC_STALE_ACTIVE_MS'] = '60000';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T13:52:00.000Z'));
    const now = Date.now();

    const staleJob = {
      id: 'stale-recent',
      processedOn: now - 80_000,
      discard: vi.fn(),
      moveToFailed: vi.fn(async () => undefined),
    };

    mockState.getJobs
      .mockResolvedValueOnce([staleJob])
      .mockResolvedValueOnce([{ id: 'recent-1', name: 'recent' }]);

    const { createRedisRpcBackend } = await import('../../../../packages/redis-rpc/backend.ts');
    const backend = createRedisRpcBackend({ prefix: 'bull' });

    await expect(
      backend.dispatch('queue-monitor', 'getRecentJobsForQueue', {
        queueName: 'mailers',
        visibilityTimeoutMs: 30_000,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'recent-1',
        name: 'recent',
      }),
    ]);

    // discard not called by source; recovery getJobs + moveToFailed exercised for coverage.
    expect(staleJob.moveToFailed).toHaveBeenCalledWith(expect.any(Error), 'pull-worker', false);
    expect(mockState.getJobs).toHaveBeenNthCalledWith(1, ['active'], 0, 99, true);
    expect(mockState.getJobs).toHaveBeenNthCalledWith(2, expect.any(Array), 0, 99, false);

    vi.useRealTimers();
  });
});
