import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bullMqState = {
  add: vi.fn(async () => ({ id: '1' })),
  getJobs: vi.fn(async () => []),
  getJob: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
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

vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual<typeof import('@zintrust/core')>('@zintrust/core');

  return {
    ...actual,
    Cloudflare: {
      ...actual.Cloudflare,
      getWorkersEnv: vi.fn(() => null),
      isCloudflareSocketsEnabled: vi.fn(() => true),
    },
    createRedisConnection: vi.fn(() => {
      const proxyUrl = actual.Env.get('REDIS_PROXY_URL', '').trim();
      const httpProxyEnabled = actual.Env.getBool('QUEUE_HTTP_PROXY_ENABLED', false);

      if (proxyUrl.length > 0 && httpProxyEnabled === false) {
        throw new Error('mocked direct BullMQ connection rejected REDIS proxy transport');
      }

      return {
        status: 'ready',
        once: vi.fn(),
        off: vi.fn(),
        quit: vi.fn(async () => undefined),
      };
    }),
  };
});

import { Env } from '@zintrust/core';
import { BullMQRedisQueue } from '../../../../packages/queue-redis/src/BullMQRedisQueue';

describe('BullMQ Redis queue (Workers)', () => {
  beforeEach(() => {
    bullMqState.add.mockClear();
    bullMqState.getJobs.mockClear();
    bullMqState.getJob.mockClear();
    bullMqState.close.mockClear();
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

  it('uses HTTP proxy fallback when enabled', async () => {
    const originalFetch = globalThis.fetch;

    try {
      Env.setSource({
        QUEUE_HTTP_PROXY_ENABLED: 'true',
        QUEUE_HTTP_PROXY_URL: 'http://127.0.0.1:7772',
        QUEUE_HTTP_PROXY_PATH: '/api/_sys/queue/rpc',
        QUEUE_HTTP_PROXY_KEY_ID: 'test-key',
        QUEUE_HTTP_PROXY_KEY: 'test-secret',
        QUEUE_HTTP_PROXY_TIMEOUT_MS: '1000',
      });

      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ ok: true, requestId: 'r1', result: 'job-http-id', error: null }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }) as unknown as typeof fetch;

      const id = await BullMQRedisQueue.enqueue('jobs', {
        payload: { ok: true },
      } as any);

      expect(id).toBe('job-http-id');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      Env.setSource(null);
      globalThis.fetch = originalFetch;
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
});
