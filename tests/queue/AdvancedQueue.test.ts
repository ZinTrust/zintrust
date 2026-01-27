import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdvancedQueue } from '@queue/AdvancedQueue';
import { createLockProvider, getLockProvider, registerLockProvider } from '@queue/LockProvider';
import { Queue } from '@tools/queue/Queue';

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

describe('AdvancedQueue', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    Queue.reset();
    process.env.QUEUE_DRIVER = 'inmemory';
    process.env['QUEUE_LOCK_PROVIDER'] = 'memory';
    process.env['QUEUE_LOCK_PREFIX'] = 'test:';
    process.env['QUEUE_DEFAULT_DEDUP_TTL'] = '1000';
  });

  afterEach(() => {
    process.env = { ...envBackup };
    Queue.reset();
  });

  it('attaches queue metadata for conditional releaseAfter', async () => {
    const payloads: Array<unknown> = [];
    Queue.register('inmemory', makeDriver(payloads));

    const advanced = createAdvancedQueue({
      name: 'test',
      lockProvider: 'memory',
      defaultDedupTtl: 1000,
    });

    await advanced.enqueue(
      'queue',
      { foo: 'bar' },
      {
        uniqueId: 'job-1',
        deduplication: {
          id: 'job-1',
          ttl: 1000,
          releaseAfter: 'success',
        },
      }
    );

    expect(payloads).toHaveLength(1);
    const payload = payloads[0] as Record<string, unknown>;
    expect(payload['__zintrustQueueMeta']).toBeTruthy();
  });

  it('releases lock after numeric delay', async () => {
    vi.useFakeTimers();

    const payloads: Array<unknown> = [];
    Queue.register('inmemory', makeDriver(payloads));

    const advanced = createAdvancedQueue({
      name: 'test',
      lockProvider: 'memory',
      defaultDedupTtl: 1000,
    });

    await advanced.enqueue(
      'queue',
      { foo: 'bar' },
      {
        uniqueId: 'job-delay',
        deduplication: {
          id: 'job-delay',
          ttl: 1000,
          releaseAfter: 50,
        },
      }
    );

    const provider = getLockProvider('memory');
    expect(provider).toBeTruthy();

    const before = await provider!.status('job-delay');
    expect(before.exists).toBe(true);

    await vi.runAllTimersAsync();

    const after = await provider!.status('job-delay');
    expect(after.exists).toBe(false);

    vi.useRealTimers();
  });

  it('enforces max lock TTL', async () => {
    process.env['QUEUE_MAX_LOCK_TTL'] = '100';

    const payloads: Array<unknown> = [];
    Queue.register('inmemory', makeDriver(payloads));

    const advanced = createAdvancedQueue({
      name: 'test',
      lockProvider: 'memory',
      defaultDedupTtl: 1000,
    });

    await expect(
      advanced.enqueue(
        'queue',
        { foo: 'bar' },
        {
          deduplication: {
            id: 'job-ttl',
            ttl: 200,
          },
        }
      )
    ).rejects.toThrow();
  });

  it('registers memory lock provider if missing', () => {
    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);

    const advanced = createAdvancedQueue({
      name: 'test',
      lockProvider: 'memory',
      defaultDedupTtl: 1000,
    });

    expect(advanced).toBeTruthy();
  });
});
