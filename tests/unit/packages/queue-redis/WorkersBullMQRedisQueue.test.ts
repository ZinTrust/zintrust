import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bullMqState = {
  add: vi.fn(async () => ({ id: '1' })),
  getJobs: vi.fn(async () => []),
  getJob: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
};

const redisState = {
  quit: vi.fn(async () => undefined),
  disconnect: vi.fn(() => undefined),
};

vi.mock('bullmq', () => {
  class Queue {
    add(...args: unknown[]) {
      return bullMqState.add(...args);
    }
    getJobs() {
      return bullMqState.getJobs();
    }
    getJob() {
      return bullMqState.getJob();
    }
    close() {
      return bullMqState.close();
    }
  }
  return { Queue };
});

vi.mock('@zintrust/core/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: vi.fn(() => null),
    isCloudflareSocketsEnabled: vi.fn(() => true),
    getWorkersVar: vi.fn(() => null),
  },
}));

vi.mock('@zintrust/core/redis', () => ({
  createRedisConnection: vi.fn(() => {
    return {
      status: 'ready',
      once: vi.fn(),
      off: vi.fn(),
      quit: redisState.quit,
      disconnect: redisState.disconnect,
    };
  }),
  getBullMQSafeQueueName: vi.fn((name: string) => name),
}));

import { Env } from '@zintrust/core/config';
import { BullMQRedisQueue } from '../../../../packages/queue-redis/src/BullMQRedisQueue';

describe('BullMQ Redis queue (Workers)', () => {
  beforeEach(() => {
    bullMqState.add.mockClear();
    bullMqState.getJobs.mockClear();
    bullMqState.getJob.mockClear();
    bullMqState.close.mockClear();
    redisState.quit.mockClear().mockResolvedValue(undefined);
    redisState.disconnect.mockClear();
    Env.setSource({
      QUEUE_HTTP_PROXY_ENABLED: 'false',
      USE_REDIS_PROXY: 'false',
      REDIS_PROXY_URL: '',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_QUEUE_DB: '0',
    });
  });

  afterEach(async () => {
    await BullMQRedisQueue.shutdown();
    Env.setSource(null);
  });

  it('acks pulled jobs by finalizing them as completed instead of removing them', async () => {
    const moveToCompleted = vi.fn(async () => undefined);

    bullMqState.getJob.mockResolvedValueOnce({
      id: 'job-1',
      moveToCompleted,
      remove: vi.fn(async () => undefined),
    });

    await expect(BullMQRedisQueue.ack('jobs', 'job-1')).resolves.toBeUndefined();

    expect(moveToCompleted).toHaveBeenCalledWith('acknowledged', 'pull-worker', false);
  });

  it('uses the direct BullMQ driver when HTTP proxy mode is disabled', async () => {
    try {
      Env.setSource({
        USE_REDIS_PROXY: 'false',
        REDIS_PROXY_URL: '',
        QUEUE_HTTP_PROXY_ENABLED: 'false',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: '',
        REDIS_QUEUE_DB: '0',
      });

      await expect(
        BullMQRedisQueue.enqueue('jobs', {
          payload: { ok: true },
        } as any)
      ).resolves.toBe('1');

      expect(bullMqState.add).toHaveBeenCalled();
    } finally {
      Env.setSource(null);
    }
  });

  it('prefers explicit payload jobId over legacy uniqueId when enqueueing BullMQ jobs', async () => {
    bullMqState.add.mockResolvedValueOnce({ id: 'job-id-123' });

    await BullMQRedisQueue.enqueue('jobs', {
      jobId: 'job-id-123',
      uniqueId: 'legacy-unique-id',
      payload: { ok: true },
    } as any);

    expect(bullMqState.add).toHaveBeenCalledWith(
      'jobs-job',
      expect.objectContaining({
        jobId: 'job-id-123',
        uniqueId: 'legacy-unique-id',
      }),
      expect.objectContaining({ jobId: 'job-id-123' })
    );
  });

  it('allows reuse of the same deduplication id across different queues', async () => {
    bullMqState.add.mockResolvedValue({ id: 'job-id-123' });

    const first = await BullMQRedisQueue.enqueue('dispatch', {
      payload: { step: 'dispatch' },
      uniqueVia: 'memory',
      deduplication: {
        id: 'shared-lock-id',
        ttl: 30000,
      },
    } as any);

    const second = await BullMQRedisQueue.enqueue('execute', {
      payload: { step: 'execute' },
      uniqueVia: 'memory',
      deduplication: {
        id: 'shared-lock-id',
        ttl: 30000,
      },
    } as any);

    const third = await BullMQRedisQueue.enqueue('dispatch', {
      payload: { step: 'dispatch-again' },
      uniqueVia: 'memory',
      deduplication: {
        id: 'shared-lock-id',
        ttl: 30000,
      },
    } as any);

    expect(first).toBe('job-id-123');
    expect(second).toBe('job-id-123');
    expect(third).toBe('shared-lock-id');
    expect(bullMqState.add).toHaveBeenCalledTimes(2);
  });

  it('enqueues later jobs when deduplication collisionBehavior is enqueue', async () => {
    bullMqState.add.mockResolvedValue({ id: 'job-id-123' });

    const first = await BullMQRedisQueue.enqueue('dispatch', {
      payload: { step: 'dispatch' },
      uniqueVia: 'memory',
      deduplication: {
        id: 'serialized-lock-id',
        ttl: 30000,
        collisionBehavior: 'enqueue',
      },
    } as any);

    const second = await BullMQRedisQueue.enqueue('dispatch', {
      payload: { step: 'dispatch-again' },
      uniqueVia: 'memory',
      deduplication: {
        id: 'serialized-lock-id',
        ttl: 30000,
        collisionBehavior: 'enqueue',
      },
    } as any);

    expect(first).toBe('job-id-123');
    expect(second).toBe('job-id-123');
    expect(bullMqState.add).toHaveBeenCalledTimes(2);
  });

  it('passes age-based removeOnFail to BullMQ when BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS is set', async () => {
    Env.setSource({
      USE_REDIS_PROXY: 'false',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_QUEUE_DB: '0',
      BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS: '604800',
    });

    await BullMQRedisQueue.enqueue('jobs', { payload: { ok: true } } as any);

    expect(bullMqState.add).toHaveBeenCalledWith(
      'jobs-job',
      expect.anything(),
      expect.objectContaining({ removeOnFail: { age: 604800 } })
    );
  });

  it('passes combined age+count removeOnComplete when both envs are set', async () => {
    Env.setSource({
      USE_REDIS_PROXY: 'false',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_QUEUE_DB: '0',
      BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS: '86400',
      BULLMQ_REMOVE_ON_COMPLETE: '500',
    });

    await BullMQRedisQueue.enqueue('jobs', { payload: { ok: true } } as any);

    expect(bullMqState.add).toHaveBeenCalledWith(
      'jobs-job',
      expect.anything(),
      expect.objectContaining({ removeOnComplete: { age: 86400, count: 500 } })
    );
  });

  it('honours explicit payload removeOnFail over env-derived retention', async () => {
    Env.setSource({
      USE_REDIS_PROXY: 'false',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_QUEUE_DB: '0',
      BULLMQ_REMOVE_ON_FAIL_AGE_SECONDS: '604800',
    });

    await BullMQRedisQueue.enqueue('jobs', {
      payload: { ok: true },
      removeOnFail: false,
    } as any);

    expect(bullMqState.add).toHaveBeenCalledWith(
      'jobs-job',
      expect.anything(),
      expect.objectContaining({ removeOnFail: false })
    );
  });

  it('forces disconnect when shared Redis quit hangs during shutdown', async () => {
    vi.useFakeTimers();

    redisState.quit.mockReturnValueOnce(new Promise<void>(() => undefined));

    await BullMQRedisQueue.enqueue('jobs', {
      payload: { ok: true },
    } as any);

    const shutdownPromise = BullMQRedisQueue.shutdown();
    await vi.advanceTimersByTimeAsync(1000);
    await shutdownPromise;

    expect(redisState.disconnect).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
