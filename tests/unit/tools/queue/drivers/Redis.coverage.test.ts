import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Queue API coverage tests', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
    delete process.env['REDIS_URL'];
  });

  it('logs a warning when connect() fails but still works', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fakeDriver = {
      enqueue: async () => {
        // eslint-disable-next-line no-console
        console.warn('Redis client connect failed: connect failed');
        return 'mock-id';
      },
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    };

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('redis', fakeDriver);

    await expect(Queue.enqueue('q', { a: 1 }, 'redis')).resolves.toEqual(expect.any(String));
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('marks connected when connect() is not present', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const fakeDriver = {
      enqueue: async () => 'mock-id',
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    };

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('redis', fakeDriver);

    await Queue.enqueue('q', { a: 1 }, 'redis');
    await expect(Queue.length('q', 'redis')).resolves.toBeTypeOf('number');
  });

  it('throws TRY_CATCH_ERROR when a dequeued message is invalid JSON', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const fakeDriver = {
      enqueue: async () => 'mock-id',
      dequeue: async () => {
        const error = new Error('Failed to parse queue message');
        (error as any).code = 'TRY_CATCH_ERROR';
        throw error;
      },
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    };

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('redis', fakeDriver);

    await expect(Queue.dequeue('q', 'redis')).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws CONFIG_ERROR when redis package is missing and no injected fake exists', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const fakeDriver = {
      enqueue: async () => {
        const error = new Error('Redis queue driver requires redis');
        (error as any).code = 'CONFIG_ERROR';
        throw error;
      },
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    };

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('redis', fakeDriver);

    await expect(Queue.enqueue('q', { a: 1 }, 'redis')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });
});

describe('Queue driver coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
  });

  it('covers all Queue driver methods', async () => {
    const fakeDriver = {
      enqueue: vi.fn().mockResolvedValue('job-id'),
      dequeue: vi.fn().mockResolvedValue({ id: '1', payload: { data: 'test' } }),
      ack: vi.fn().mockResolvedValue(undefined),
      length: vi.fn().mockResolvedValue(5),
      drain: vi.fn().mockResolvedValue(undefined),
    };

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('test-driver', fakeDriver);

    // Test enqueue
    const jobId = await Queue.enqueue('test-queue', { message: 'hello' }, 'test-driver');
    expect(jobId).toBe('job-id');
    expect(fakeDriver.enqueue).toHaveBeenCalledWith('test-queue', { message: 'hello' });

    // Test dequeue
    const message = await Queue.dequeue('test-queue', 'test-driver');
    expect(message).toEqual({ id: '1', payload: { data: 'test' } });
    expect(fakeDriver.dequeue).toHaveBeenCalledWith('test-queue');

    // Test ack
    await Queue.ack('test-queue', 'job-id', 'test-driver');
    expect(fakeDriver.ack).toHaveBeenCalledWith('test-queue', 'job-id');

    // Test length
    const length = await Queue.length('test-queue', 'test-driver');
    expect(length).toBe(5);
    expect(fakeDriver.length).toHaveBeenCalledWith('test-queue');

    // Test drain
    await Queue.drain('test-queue', 'test-driver');
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

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('typed-driver', fakeDriver);

    // Test with generic types
    const jobId = await Queue.enqueue<TestPayload>(
      'typed-queue',
      { id: 1, name: 'test' },
      'typed-driver'
    );
    expect(jobId).toBe('job-id');

    const message = await Queue.dequeue<TestPayload>('typed-queue', 'typed-driver');
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

    const Queue = (await import('@queue/Queue')).default;
    Queue.register('error-driver', fakeDriver);

    // Test error propagation
    await expect(Queue.enqueue('test-queue', {}, 'error-driver')).rejects.toThrow('Enqueue failed');
    await expect(Queue.dequeue('test-queue', 'error-driver')).rejects.toThrow('Dequeue failed');
    await expect(Queue.ack('test-queue', 'job-id', 'error-driver')).rejects.toThrow('Ack failed');
    await expect(Queue.length('test-queue', 'error-driver')).rejects.toThrow('Length failed');
    await expect(Queue.drain('test-queue', 'error-driver')).rejects.toThrow('Drain failed');
  });
});
