import { beforeEach, describe, expect, it, vi } from 'vitest';

import RedisQueue from '@tools/queue/drivers/Redis';
import { Queue } from '@tools/queue/Queue';

describe('RedisQueue.ack', () => {
  beforeEach(() => {
    Queue.reset();
  });

  it('delegates to the registered redis driver', async () => {
    const ack = vi.fn().mockResolvedValue(undefined);
    Queue.register('redis', {
      enqueue: async () => 'id',
      dequeue: async () => undefined,
      ack,
      length: async () => 0,
      drain: async () => undefined,
    });

    await expect(RedisQueue.ack('q', 'id')).resolves.toBeUndefined();
    expect(ack).toHaveBeenCalledWith('q', 'id');
  });
});
