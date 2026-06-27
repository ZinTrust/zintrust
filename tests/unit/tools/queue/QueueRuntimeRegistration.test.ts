import { afterEach, describe, expect, it, vi } from 'vitest';

import { queueConfig } from '@/config/queue';
import { Queue } from '@/tools/queue/Queue';
import { registerQueuesFromRuntimeConfig } from '@/tools/queue/QueueRuntimeRegistration';

describe('QueueRuntimeRegistration', () => {
  afterEach(() => {
    vi.doUnmock('@zintrust/zedgi');
    vi.doUnmock('@node-singletons/fs');
    vi.doUnmock('@node-singletons/url');
    vi.resetModules();
    Queue.reset();
  });

  it('registers built-in drivers and default alias', async () => {
    await registerQueuesFromRuntimeConfig(queueConfig);

    expect(() => Queue.get('sync')).not.toThrow();
    expect(() => Queue.get('inmemory')).not.toThrow();

    // default alias should exist when the default is registered
    // (in templates this is typically "sync").
    expect(() => Queue.get('default')).not.toThrow();
  });

  it('throws when default driver is empty', async () => {
    Queue.reset();

    await expect(
      registerQueuesFromRuntimeConfig({
        default: '',
      } as any)
    ).rejects.toThrow(/Queue default driver is not configured/i);
  });

  it('registers queue-zedgi from the installed package', async () => {
    vi.resetModules();
    const create = vi.fn(() => ({
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      ack: vi.fn(),
      length: vi.fn(),
      drain: vi.fn(),
    }));
    vi.doMock('@zintrust/zedgi', () => ({ ZedgiQueueDriver: { create } }));

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'queue-zedgi',
      drivers: {
        'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
      },
    } as never);

    expect(create).toHaveBeenCalledWith({ driver: 'queue-zedgi', database: 1 });
    expect(() => RuntimeQueue.get('queue-zedgi')).not.toThrow();
    expect(() => RuntimeQueue.get('default')).not.toThrow();
  });

  it('registers queue-zedgi from the local dist fallback', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/zedgi', () => {
      throw new Error('package missing');
    });
    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: vi.fn(() => ({
        href:
          'data:text/javascript,export const ZedgiQueueDriver = { create: () => ({ enqueue(){}, dequeue(){}, ack(){}, length(){}, drain(){} }) }',
      })),
    }));

    const { Queue: RuntimeQueue } = await import('@/tools/queue/Queue');
    const { registerQueuesFromRuntimeConfig: registerRuntimeQueues } = await import(
      '@/tools/queue/QueueRuntimeRegistration'
    );

    await registerRuntimeQueues({
      default: 'queue-zedgi',
      drivers: {
        'queue-zedgi': { driver: 'queue-zedgi', database: 1 },
      },
    } as never);

    expect(() => RuntimeQueue.get('queue-zedgi')).not.toThrow();
  });

  it('throws when queue-zedgi cannot be registered', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/zedgi', () => {
      throw new Error('package missing');
    });
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
      } as never)
    ).rejects.toThrow(/Zedgi queue driver is not registered/i);
  });

  it('creates external service API errors', async () => {
    const { createApiError } = await import('@common/ExternalServiceUtils');

    expect(createApiError('bad request', 'Example').message).toContain(
      'Example API error: bad request'
    );
  });
});
