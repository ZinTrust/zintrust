import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeDriver = (capture: Array<unknown>) => ({
  enqueue: vi.fn(async (_queue: string, payload: unknown) => {
    capture.push(payload);
    return 'job-1';
  }),
  dequeue: vi.fn(async () => undefined),
  ack: vi.fn(async () => undefined),
  length: vi.fn(async () => 0),
  drain: vi.fn(async () => undefined),
});

describe('QueueExtensions', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    process.env.QUEUE_DRIVER = 'memory';
    process.env['QUEUE_DRIVER'] = 'memory';
    process.env['QUEUE_LOCK_PREFIX'] = 'test:';

    // Register the memory driver for tests
    const { InMemoryQueue } = await import('@tools/queue/drivers/InMemory');
    const { Queue } = await import('@tools/queue/Queue');
    Queue.register('memory', InMemoryQueue);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  it('falls back to standard enqueue when advanced queue is not initialized', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    const { enqueueAdvanced } = await import('@queue/QueueExtensions');
    const payloads: Array<unknown> = [];
    Queue.register('memory', makeDriver(payloads));
    await enqueueAdvanced('queue', { foo: 'bar' });

    expect(payloads).toHaveLength(1);
  });

  it('uses advanced queue after extendQueue', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    const { extendQueue, enqueueAdvanced } = await import('@queue/QueueExtensions');
    const payloads: Array<unknown> = [];
    Queue.register('memory', makeDriver(payloads));

    extendQueue({
      name: 'test',
      lockProvider: 'memory',
      defaultDedupTtl: 1000,
    });

    await enqueueAdvanced(
      'queue',
      { foo: 'bar' },
      {
        deduplication: {
          id: 'job-1',
          ttl: 1000,
          releaseAfter: 'success',
        },
      }
    );

    const payload = payloads[0] as Record<string, unknown>;
    expect(payload['__zintrustQueueMeta']).toBeTruthy();
  });
});
