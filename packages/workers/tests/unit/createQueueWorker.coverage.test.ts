import { describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

vi.mock('@zintrust/core', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  Queue: queueMock,
}));

describe('createQueueWorker coverage', () => {
  it('processes one item using maxItems loop', async () => {
    const { Queue } = await import('@zintrust/core');
    (Queue.dequeue as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce({ id: '1', payload: { ok: true }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    const { createQueueWorker } = await import('@zintrust/workers');

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
