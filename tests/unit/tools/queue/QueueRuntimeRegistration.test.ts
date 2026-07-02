import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queueConfig } from '@/config/queue';
import { Queue } from '@/tools/queue/Queue';

const mockZedgiState = {
  shouldThrow: false,
  isInvalidModule: false,
  create: vi.fn(),
};

const mockZedgi = {
  get ZedgiQueueDriver() {
    if (mockZedgiState.shouldThrow) {
      throw new Error('package missing');
    }
    if (mockZedgiState.isInvalidModule) {
      return undefined;
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

const mockEnvState = {
  jobReliabilityAutostart: false,
};

const mockRuntimeState = {
  isCloudflare: false,
};

vi.mock('@zintrust/zedgi', () => mockZedgi);
vi.mock('@zintrust/queue-redis', () => mockQueueRedis);
vi.mock('@config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/env')>();
  return {
    ...actual,
    Env: {
      ...actual.Env,
      getBool: vi.fn((key: string, fallback: boolean) => {
        if (key === 'JOB_RELIABILITY_AUTOSTART') {
          return mockEnvState.jobReliabilityAutostart;
        }
        return actual.Env.getBool(key, fallback);
      }),
    },
  };
});
const mockOrchestratorState = {
  startCalled: false,
};

vi.mock('@runtime/detectRuntime', () => ({
  detectRuntime: () => ({
    isCloudflare: mockRuntimeState.isCloudflare,
  }),
}));
vi.mock('@tools/queue/QueueReliabilityOrchestrator', () => ({
  QueueReliabilityOrchestrator: {
    start: vi.fn(() => {
      mockOrchestratorState.startCalled = true;
    }),
    stop: vi.fn(),
    isEnabled: () => true,
  },
}));

describe('QueueRuntimeRegistration', () => {
  beforeEach(() => {
    mockZedgiState.shouldThrow = false;
    mockZedgiState.isInvalidModule = false;
    mockZedgiState.create = vi.fn();
    mockQueueRedisState.shouldThrow = false;
    mockQueueRedisState.RedisQueue = undefined;
    mockQueueRedisState.BullMQRedisQueue = undefined;
    mockEnvState.jobReliabilityAutostart = false;
    mockRuntimeState.isCloudflare = false;
    mockOrchestratorState.startCalled = false;
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

  it('handles invalid zedgi module structure', async () => {
    mockZedgiState.isInvalidModule = true;

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

  it('starts reliability orchestrator when autostart is enabled', async () => {
    mockEnvState.jobReliabilityAutostart = true;

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'inmemory',
      drivers: {
        inmemory: { driver: 'inmemory' },
      },
    } as any);

    expect(mockOrchestratorState.startCalled).toBe(true);
  });

  it('handles missing driver in Cloudflare runtime by falling back to sync', async () => {
    mockRuntimeState.isCloudflare = true;

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    // Call register for a non-existent driver 'invalid-driver'
    await registerRuntimeQueues({
      default: 'invalid-driver',
      drivers: {},
    } as any);

    // Should fall back and register 'default' as 'sync' (which is InMemoryQueue)
    expect(() => RuntimeQueue.get('default')).not.toThrow();
  });

  it('throws config error for missing driver in non-Cloudflare runtime', async () => {
    mockRuntimeState.isCloudflare = false;

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues({
        default: 'invalid-driver',
        drivers: {},
      } as any)
    ).rejects.toThrow(/Queue default driver is not available/i);
  });

  it('covers additional registration branches', async () => {
    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    // 1. covers already registered paths
    const mockDriver = { enqueue: vi.fn() } as any;
    RuntimeQueue.register('redis', mockDriver);
    RuntimeQueue.register('queue-zedgi', mockDriver);

    await registerRuntimeQueues({
      default: 'redis',
      drivers: {
        redis: { driver: 'redis' },
      },
    } as any);
    expect(RuntimeQueue.get('redis')).toBe(mockDriver);

    await registerRuntimeQueues({
      default: 'queue-zedgi',
      drivers: {
        'queue-zedgi': { driver: 'queue-zedgi' },
      },
    } as any);
    expect(RuntimeQueue.get('queue-zedgi')).toBe(mockDriver);

    // 2. covers invalid redis module structure (line 70, 106)
    vi.resetModules();
    const { Queue: RuntimeQueue2 } = await import('@/tools/queue/Queue');
    RuntimeQueue2.reset();
    mockQueueRedisState.shouldThrow = false;
    mockQueueRedisState.RedisQueue = undefined;
    mockQueueRedisState.BullMQRedisQueue = undefined;

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues2 } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues2({
        default: 'redis',
        drivers: {
          redis: { driver: 'redis' },
        },
      } as any)
    ).rejects.toThrow(/Redis queue driver is not registered/i);

    // 3. covers getLocalPackageUrl catch block (line 48)
    vi.resetModules();
    const { Queue: RuntimeQueue3 } = await import('@/tools/queue/Queue');
    RuntimeQueue3.reset();
    mockQueueRedisState.shouldThrow = true;
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => {
        throw new Error('mock fs error');
      },
    }));

    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues3 } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await expect(
      registerRuntimeQueues3({
        default: 'redis',
        drivers: {
          redis: { driver: 'redis' },
        },
      } as any)
    ).rejects.toThrow(/Redis queue driver is not registered/i);
  });
});
