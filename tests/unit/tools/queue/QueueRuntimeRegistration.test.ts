import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queueConfig } from '@/config/queue';
import { Queue } from '@/tools/queue/Queue';

const mockZedgiState = {
  shouldThrow: false,
  create: vi.fn(),
};

const mockZedgi = {
  get ZedgiQueueDriver() {
    if (mockZedgiState.shouldThrow) {
      throw new Error('package missing');
    }
    return { create: mockZedgiState.create };
  }
};

const mockQueueRedisState = {
  shouldThrow: false,
  RedisQueue: undefined as any,
  BullMQRedisQueue: undefined as any,
};

const mockQueueRedis = {
  get RedisQueue() {
    if (mockQueueRedisState.shouldThrow) {
      throw new Error('package missing');
    }
    return mockQueueRedisState.RedisQueue;
  },
  get BullMQRedisQueue() {
    if (mockQueueRedisState.shouldThrow) {
      throw new Error('package missing');
    }
    return mockQueueRedisState.BullMQRedisQueue;
  }
};

vi.mock('@zintrust/zedgi', () => mockZedgi);
vi.mock('@zintrust/queue-redis', () => mockQueueRedis);

describe('QueueRuntimeRegistration', () => {
  beforeEach(() => {
    mockZedgiState.shouldThrow = false;
    mockZedgiState.create = vi.fn();
    mockQueueRedisState.shouldThrow = false;
    mockQueueRedisState.RedisQueue = undefined;
    mockQueueRedisState.BullMQRedisQueue = undefined;
    Queue.reset();
  });

  afterEach(() => {
    vi.doUnmock('@node-singletons/fs');
    vi.doUnmock('@node-singletons/url');
    vi.resetModules();
  });

  it('registers built-in drivers and default alias', async () => {
    // Make zedgi and redis throw to fall back / fail, or let them succeed/fail
    mockZedgiState.shouldThrow = true;
    mockQueueRedisState.shouldThrow = true;

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues(queueConfig);

    expect(() => Queue.get('sync')).not.toThrow();
    expect(() => Queue.get('inmemory')).not.toThrow();
    expect(() => Queue.get('default')).not.toThrow();
  });

  it('throws when default driver is empty', async () => {
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues({
        default: '',
      } as any)
    ).rejects.toThrow(/Queue default driver is not configured/i);
  });

  it('registers queue-zedgi from the installed package', async () => {
    const mockDriver = { enqueue: vi.fn() };
    mockZedgiState.create.mockReturnValue(mockDriver);

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'queue-zedgi',
      drivers: {
        'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
      },
    } as any);

    expect(mockZedgiState.create).toHaveBeenCalledWith({ driver: 'queue-zedgi', database: 1 });
    expect(RuntimeQueue.get('queue-zedgi')).toBe(mockDriver);
    expect(RuntimeQueue.get('default')).toBe(mockDriver);
  });

  it('registers queue-zedgi from the local dist fallback', async () => {
    vi.resetModules();
    mockZedgiState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: vi.fn(() => ({
        href:
          'data:text/javascript,export const ZedgiQueueDriver = { create: () => ({ enqueue(){}, dequeue(){}, ack(){}, length(){}, drain(){} }) }',
      })),
    }));

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'queue-zedgi',
      drivers: {
        'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
      },
    } as any);

    expect(() => RuntimeQueue.get('queue-zedgi')).not.toThrow();
  });

  it('throws when queue-zedgi cannot be registered', async () => {
    vi.resetModules();
    mockZedgiState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues({
        default: 'queue-zedgi',
        drivers: {
          'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
        },
      } as any)
    ).rejects.toThrow(/Zedgi queue driver is not registered/i);
  });

  it('registers redis from the installed package (RedisQueue)', async () => {
    const mockRedisQueue = class {};
    mockQueueRedisState.RedisQueue = mockRedisQueue;

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'redis',
      drivers: {
        redis: { driver: 'redis', database: 1 },
      },
    } as any);

    expect(RuntimeQueue.get('redis')).toBe(mockRedisQueue);
  });

  it('registers redis from the installed package (BullMQRedisQueue)', async () => {
    const mockBullMQRedisQueue = class {};
    mockQueueRedisState.BullMQRedisQueue = mockBullMQRedisQueue;

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'redis',
      drivers: {
        redis: { driver: 'redis', database: 1 },
      },
    } as any);

    expect(RuntimeQueue.get('redis')).toBe(mockBullMQRedisQueue);
  });

  it('registers redis from the local dist fallback (RedisQueue)', async () => {
    vi.resetModules();
    mockQueueRedisState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: vi.fn(() => ({
        href:
          'data:text/javascript,export const RedisQueue = class {}',
      })),
    }));

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'redis',
      drivers: {
        redis: { driver: 'redis', database: 1 },
      },
    } as any);

    expect(() => RuntimeQueue.get('redis')).not.toThrow();
  });

  it('registers redis from the local dist fallback (BullMQRedisQueue)', async () => {
    vi.resetModules();
    mockQueueRedisState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: vi.fn(() => ({
        href:
          'data:text/javascript,export const BullMQRedisQueue = class {}',
      })),
    }));

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    RuntimeQueue.reset();
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'redis',
      drivers: {
        redis: { driver: 'redis', database: 1 },
      },
    } as any);

    expect(() => RuntimeQueue.get('redis')).not.toThrow();
  });

  it('throws when redis cannot be registered', async () => {
    vi.resetModules();
    mockQueueRedisState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues({
        default: 'redis',
        drivers: {
          redis: { driver: 'redis', database: 1 },
        },
      } as any)
    ).rejects.toThrow(/Redis queue driver is not registered/i);
  });

  it('handles empty cwd scenario in getLocalPackageUrl gracefully', async () => {
    mockZedgiState.shouldThrow = true;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('');

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    try {
      await expect(
        registerRuntimeQueues({
          default: 'queue-zedgi',
          drivers: {
            'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
          },
        } as any)
      ).rejects.toThrow(/Zedgi queue driver is not registered/i);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('creates external service API errors', async () => {
    const { createApiError } = await import('@common/ExternalServiceUtils');

    expect(createApiError('bad request', 'Example').message).toContain(
      'Example API error: bad request'
    );
  });
});
