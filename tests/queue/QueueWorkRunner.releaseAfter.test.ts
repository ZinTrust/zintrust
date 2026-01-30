import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: {
    send: vi.fn(),
  },
}));

vi.mock('@notification/Notification', () => ({
  Notification: {
    send: vi.fn(),
  },
}));

import { Broadcast } from '@broadcast/Broadcast';
import { Notification } from '@notification/Notification';

import type { IQueueDriver } from '@tools/queue/Queue';

const makeDriver = (
  messages: Array<{ id: string; payload: Record<string, unknown> }>
): IQueueDriver => {
  return {
    enqueue: vi.fn(async () => 'enqueued'),
    dequeue: vi.fn(async () => {
      const message = messages.shift();
      if (!message) return undefined;
      return {
        id: message.id,
        payload: message.payload,
        attempts: 1, // Add the missing attempts property
      } as any; // Type assertion to bypass generic constraints in test
    }),
    ack: vi.fn(async () => undefined),
    length: vi.fn(async () => messages.length),
    drain: vi.fn(async () => {
      messages.length = 0;
    }),
  };
};

describe('QueueWorkRunner releaseAfter handling', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(Broadcast.send).mockReset();
    vi.mocked(Notification.send).mockReset();
    process.env['QUEUE_DRIVER'] = 'memory';
    process.env['QUEUE_LOCK_PREFIX'] = 'test:';
    process.env['QUEUE_DEFAULT_DEDUP_TTL'] = '1000';

    // Register the memory driver for tests
    const { InMemoryQueue } = await import('@tools/queue/drivers/InMemory');
    const { Queue } = await import('@tools/queue/Queue');
    Queue.register('memory', InMemoryQueue);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  it('releases lock after success with condition + delay', async () => {
    vi.useFakeTimers();

    const { createLockProvider, registerLockProvider } = await import('@queue/LockProvider');
    const { Queue } = await import('@tools/queue/Queue');
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);

    await provider.acquire('job-1', { ttl: 1000 });

    const messages = [
      {
        id: 'msg-1',
        payload: {
          type: 'broadcast',
          channel: 'chan',
          event: 'evt',
          data: { ok: true },
          __zintrustQueueMeta: {
            deduplicationId: 'job-1',
            releaseAfter: { condition: 'job.result.status === "completed"', delay: 50 },
          },
        },
      },
    ];

    const driver = makeDriver(messages);
    Queue.register('test', driver);

    vi.mocked(Broadcast.send).mockResolvedValueOnce(undefined);

    await QueueWorkRunner.run({
      queueName: 'test-queue',
      driverName: 'test',
      kind: 'broadcast',
      maxItems: 1,
      timeoutSeconds: 1,
      retry: 0,
    });

    const before = await provider.status('job-1');
    expect(before.exists).toBe(true);

    await vi.runAllTimersAsync();

    const after = await provider.status('job-1');
    expect(after.exists).toBe(false);

    vi.useRealTimers();
  });

  it('releases lock after terminal failure', async () => {
    const { createLockProvider, registerLockProvider } = await import('@queue/LockProvider');
    const { Queue } = await import('@tools/queue/Queue');
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);

    await provider.acquire('job-fail', { ttl: 1000 });

    const messages = [
      {
        id: 'msg-2',
        payload: {
          type: 'notification',
          recipient: 'u@example.com',
          message: 'hi',
          __zintrustQueueMeta: {
            deduplicationId: 'job-fail',
            releaseAfter: 'failed',
          },
        },
      },
    ];

    const driver = makeDriver(messages);
    Queue.register('test', driver);

    vi.mocked(Notification.send).mockRejectedValueOnce(new Error('boom'));

    await QueueWorkRunner.run({
      queueName: 'test-queue',
      driverName: 'test',
      kind: 'notification',
      maxItems: 1,
      timeoutSeconds: 1,
      retry: 0,
    });

    const after = await provider.status('job-fail');
    expect(after.exists).toBe(false);
  });

  it('reuses cached lock provider when available', async () => {
    const { createLockProvider, registerLockProvider, getLockProvider } =
      await import('@queue/LockProvider');

    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);

    const registered = getLockProvider('memory');
    expect(registered).toBe(provider);
  });
});
