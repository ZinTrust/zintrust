import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RedisQueue extra coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
    delete process.env['REDIS_URL'];
    vi.unmock('redis');
  });

  it('logs a warning when connect() fails but still works', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.doMock('redis', () => ({
      createClient: () => ({
        connect: async () => {
          throw new Error('connect failed');
        },
        rPush: async () => 1,
        lPop: async () => null,
        lLen: async () => 0,
        del: async () => 1,
      }),
    }));

    const { default: RedisQueue } = await import('@tools/queue/drivers/Redis');

    await expect(RedisQueue.enqueue('q', { a: 1 })).resolves.toEqual(expect.any(String));
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('marks connected when connect() is not present', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.doMock('redis', () => ({
      createClient: () => ({
        rPush: async () => 1,
        lPop: async () => null,
        lLen: async () => 0,
        del: async () => 1,
      }),
    }));

    const { default: RedisQueue } = await import('@tools/queue/drivers/Redis');

    await RedisQueue.enqueue('q', { a: 1 });
    await expect(RedisQueue.length('q')).resolves.toBeTypeOf('number');
  });

  it('throws TRY_CATCH_ERROR when a dequeued message is invalid JSON (via injected fake client)', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.doMock('redis', () => {
      throw new Error('force import failure');
    });

    (globalThis as any).__fakeRedisClient = {
      rPush: async () => 1,
      lPop: async () => 'not-json',
      lLen: async () => 0,
      del: async () => 0,
    };

    const { default: RedisQueue } = await import('@tools/queue/drivers/Redis');

    await expect(RedisQueue.dequeue('q')).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws CONFIG_ERROR when redis package is missing and no injected fake exists', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.doMock('redis', () => {
      throw new Error('force import failure');
    });

    const { default: RedisQueue } = await import('@tools/queue/drivers/Redis');

    await expect(RedisQueue.enqueue('q', { a: 1 })).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });
});
