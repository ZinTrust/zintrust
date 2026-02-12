import { describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => {
  class Queue {
    add() {
      return Promise.resolve({ id: '1' });
    }
    getJobs() {
      return Promise.resolve([]);
    }
    getJob() {
      return Promise.resolve(undefined);
    }
    close() {
      return Promise.resolve();
    }
  }
  return { Queue };
});

import { Env } from '@/config/env';
import { BullMQRedisQueue } from '../../../../packages/queue-redis/src/BullMQRedisQueue';

describe('BullMQ Redis queue (Workers)', () => {
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
});
