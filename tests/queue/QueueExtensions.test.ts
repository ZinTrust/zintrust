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

  beforeEach(() => {
    vi.resetModules();
    process.env.QUEUE_DRIVER = 'inmemory';
    process.env['QUEUE_DRIVER'] = 'memory';
    process.env['QUEUE_LOCK_PREFIX'] = 'test:';
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  it('falls back to standard enqueue when advanced queue is not initialized', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    const { enqueueAdvanced } = await import('@queue/QueueExtensions');
    const payloads: Array<unknown> = [];
    Queue.register('inmemory', makeDriver(payloads));
    await enqueueAdvanced('queue', { foo: 'bar' });

    expect(payloads).toHaveLength(1);
  });

  it('uses advanced queue after extendQueue', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    const { extendQueue, enqueueAdvanced } = await import('@queue/QueueExtensions');
    const payloads: Array<unknown> = [];
    Queue.register('inmemory', makeDriver(payloads));

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
