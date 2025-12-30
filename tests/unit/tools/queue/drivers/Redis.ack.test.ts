import { describe, expect, it } from 'vitest';

import RedisQueue from '@tools/queue/drivers/Redis';

describe('RedisQueue.ack', () => {
  it('is a no-op and resolves', async () => {
    await expect(RedisQueue.ack('q', 'id')).resolves.toBeUndefined();
  });
});
