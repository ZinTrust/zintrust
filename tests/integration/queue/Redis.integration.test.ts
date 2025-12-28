import Queue from '@queue/Queue';
import RedisQueue from '@queue/drivers/Redis';
import { describe, expect, it } from 'vitest';

const run = typeof process.env['REDIS_URL'] === 'string' && process.env['REDIS_URL'] !== '';

describe('RedisQueue Integration', () => {
  (run ? it : it.skip)(
    'works end-to-end against a real Redis instance',
    async () => {
      // Ensure REDIS_URL is present in environment
      Queue.register('redis-integ', RedisQueue as any);

      const q = `integ-queue-${Date.now()}`;

      // ensure clean start
      await Queue.drain(q, 'redis-integ');

      const id1 = await Queue.enqueue(q, { n: 1 }, 'redis-integ');
      const id2 = await Queue.enqueue(q, { n: 2 }, 'redis-integ');

      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');

      const len = await Queue.length(q, 'redis-integ');
      expect(len).toBeGreaterThanOrEqual(2);

      const m1 = await Queue.dequeue<{ n: number }>(q, 'redis-integ');
      expect(m1).toBeDefined();

      const m2 = await Queue.dequeue<{ n: number }>(q, 'redis-integ');
      expect(m2).toBeDefined();

      // drain remaining and verify
      await Queue.drain(q, 'redis-integ');
      const len2 = await Queue.length(q, 'redis-integ');
      expect(len2).toBe(0);
    },
    20000
  );
});
