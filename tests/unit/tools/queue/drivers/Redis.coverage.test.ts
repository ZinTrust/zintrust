import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RedisQueue extra coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
    delete process.env['REDIS_URL'];
    vi.unmock('redis');
    vi.unmock('ioredis');
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

    const { default: RedisQueue } =
      await import('../../../../../packages/queue-redis/src/RedisQueue');

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

    const { default: RedisQueue } =
      await import('../../../../../packages/queue-redis/src/RedisQueue');

    await RedisQueue.enqueue('q', { a: 1 });
    await expect(RedisQueue.length('q')).resolves.toBeTypeOf('number');
  });

  it('throws TRY_CATCH_ERROR when a dequeued message is invalid JSON (via injected fake client)', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.doMock('redis', () => {
      throw new Error('force import failure');
    });
    vi.doMock('ioredis', () => ({
      default: () => {
        throw new Error('force import failure');
      },
    }));

    (globalThis as any).__fakeRedisClient = {
      rPush: async () => 1,
      lPop: async () => 'not-json',
      lLen: async () => 0,
      del: async () => 0,
    };

    const { default: RedisQueue } =
      await import('../../../../../packages/queue-redis/src/RedisQueue');

    await expect(RedisQueue.dequeue('q')).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws CONFIG_ERROR when redis package is missing and no injected fake exists', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.doMock('redis', () => {
      throw new Error('force import failure');
    });
    vi.doMock('ioredis', () => ({
      default: () => {
        throw new Error('force import failure');
      },
    }));

    const { default: RedisQueue } =
      await import('../../../../../packages/queue-redis/src/RedisQueue');

    await expect(RedisQueue.enqueue('q', { a: 1 })).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });
});

describe('RedisQueue driver coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
  });

  it('covers all RedisQueue driver methods', async () => {
    const fakeDriver = {
      enqueue: vi.fn().mockResolvedValue('job-id'),
      dequeue: vi.fn().mockResolvedValue({ id: '1', payload: { data: 'test' } }),
      ack: vi.fn().mockResolvedValue(undefined),
      length: vi.fn().mockResolvedValue(5),
      drain: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@/config/redis', () => ({
      ensureDriver: vi.fn().mockResolvedValue(fakeDriver),
    }));

    const { RedisQueue } = await import('@/tools/queue/drivers/Redis');

    // Test enqueue
    const jobId = await RedisQueue.enqueue('test-queue', { message: 'hello' });
    expect(jobId).toBe('job-id');
    expect(fakeDriver.enqueue).toHaveBeenCalledWith('test-queue', { message: 'hello' });

    // Test dequeue
    const message = await RedisQueue.dequeue('test-queue');
    expect(message).toEqual({ id: '1', payload: { data: 'test' } });
    expect(fakeDriver.dequeue).toHaveBeenCalledWith('test-queue');

    // Test ack
    await RedisQueue.ack('test-queue', 'job-id');
    expect(fakeDriver.ack).toHaveBeenCalledWith('test-queue', 'job-id');

    // Test length
    const length = await RedisQueue.length('test-queue');
    expect(length).toBe(5);
    expect(fakeDriver.length).toHaveBeenCalledWith('test-queue');

    // Test drain
    await RedisQueue.drain('test-queue');
    expect(fakeDriver.drain).toHaveBeenCalledWith('test-queue');
  });

  it('covers generic type parameters', async () => {
    interface TestPayload {
      id: number;
      name: string;
    }

    const fakeDriver = {
      enqueue: vi.fn().mockResolvedValue('job-id'),
      dequeue: vi.fn().mockResolvedValue({ id: '1', payload: { id: 1, name: 'test' } }),
      ack: vi.fn().mockResolvedValue(undefined),
      length: vi.fn().mockResolvedValue(5),
      drain: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@/config/redis', () => ({
      ensureDriver: vi.fn().mockResolvedValue(fakeDriver),
    }));

    const { RedisQueue } = await import('@/tools/queue/drivers/Redis');

    // Test with generic types
    const jobId = await RedisQueue.enqueue<TestPayload>('typed-queue', { id: 1, name: 'test' });
    expect(jobId).toBe('job-id');

    const message = await RedisQueue.dequeue<TestPayload>('typed-queue');
    expect(message?.payload).toEqual({ id: 1, name: 'test' });
  });

  it('covers error handling in driver methods', async () => {
    const fakeDriver = {
      enqueue: vi.fn().mockRejectedValue(new Error('Enqueue failed')),
      dequeue: vi.fn().mockRejectedValue(new Error('Dequeue failed')),
      ack: vi.fn().mockRejectedValue(new Error('Ack failed')),
      length: vi.fn().mockRejectedValue(new Error('Length failed')),
      drain: vi.fn().mockRejectedValue(new Error('Drain failed')),
    };

    vi.doMock('@/config/redis', () => ({
      ensureDriver: vi.fn().mockResolvedValue(fakeDriver),
    }));

    const { RedisQueue } = await import('@/tools/queue/drivers/Redis');

    // Test error propagation
    await expect(RedisQueue.enqueue('test-queue', {})).rejects.toThrow('Enqueue failed');
    await expect(RedisQueue.dequeue('test-queue')).rejects.toThrow('Dequeue failed');
    await expect(RedisQueue.ack('test-queue', 'job-id')).rejects.toThrow('Ack failed');
    await expect(RedisQueue.length('test-queue')).rejects.toThrow('Length failed');
    await expect(RedisQueue.drain('test-queue')).rejects.toThrow('Drain failed');
  });
});
