import Queue from '@queue/Queue';
import { describe, expect, it } from 'vitest';

const run = typeof process.env['REDIS_URL'] === 'string' && process.env['REDIS_URL'] !== '';

describe('Queue Integration with Redis', () => {
  it('has a REDIS_URL gate for integration execution', () => {
    expect(typeof run).toBe('boolean');
  });

  (run ? it : it.skip)(
    'works end-to-end against a real Redis instance',
    async () => {
      // Use the main Queue API with redis driver (BullMQRedisQueue)
      const q = `integ-queue-${Date.now()}`;

      // ensure clean start
      await Queue.drain(q, 'redis');

      const id1 = await Queue.enqueue(q, { n: 1 }, 'redis');
      const id2 = await Queue.enqueue(q, { n: 2 }, 'redis');

      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');

      const len = await Queue.length(q, 'redis');
      expect(len).toBeGreaterThanOrEqual(2);

      const m1 = await Queue.dequeue<{ n: number }>(q, 'redis');
      expect(m1).toBeDefined();

      const m2 = await Queue.dequeue<{ n: number }>(q, 'redis');
      expect(m2).toBeDefined();

      // drain remaining and verify
      await Queue.drain(q, 'redis');
      const len2 = await Queue.length(q, 'redis');
      expect(len2).toBe(0);
    },
    20000
  );
});
