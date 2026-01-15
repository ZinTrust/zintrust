import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tools/queue/Queue', () => ({
  Queue: {
    dequeue: vi.fn(),
    enqueue: vi.fn(),
    ack: vi.fn(),
  },
}));

describe('createQueueWorker coverage', () => {
  it('processes one item using maxItems loop', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    (Queue.dequeue as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce({ id: '1', payload: { ok: true }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker({
      kindLabel: 'job',
      defaultQueueName: 'default',
      maxAttempts: 1,
      getLogFields: () => ({}),
      handle: async () => undefined,
    });

    const processed = await worker.runOnce({ maxItems: 1 });
    expect(processed).toBe(1);
  });
});
