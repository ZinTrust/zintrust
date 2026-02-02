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

import { BullMQRedisQueue } from '../../../../packages/queue-redis/src/BullMQRedisQueue';

describe('BullMQ Redis queue (Workers)', () => {
  it('requires ENABLE_CLOUDFLARE_SOCKETS in Workers', async () => {
    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = {};

    await expect(
      BullMQRedisQueue.enqueue('jobs', {
        payload: { ok: true },
      } as any)
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        message: expect.stringContaining('ENABLE_CLOUDFLARE_SOCKETS'),
      }),
    });

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });
});
