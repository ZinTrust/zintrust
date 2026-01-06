import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tools/queue/Queue', () => ({
  Queue: queueMock,
  default: queueMock,
}));

describe('createQueueWorker (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.dequeue.mockResolvedValue(undefined);
    queueMock.enqueue.mockResolvedValue('id');
    queueMock.ack.mockResolvedValue(undefined);
  });

  it('processOne acks and returns true on success', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const handle = vi.fn().mockResolvedValue(undefined);
    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle,
    });

    queueMock.dequeue.mockResolvedValueOnce({ id: 'm1', payload: { v: 1 }, attempts: 0 });

    await expect(worker.processOne('q')).resolves.toBe(true);
    expect(handle).toHaveBeenCalledWith({ v: 1 });
    expect(queueMock.ack).toHaveBeenCalledWith('q', 'm1', undefined);
  });

  it('processOne re-enqueues when handle throws and attempts below max', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockRejectedValue(new Error('boom')),
    });

    queueMock.dequeue.mockResolvedValueOnce({ id: 'm2', payload: { v: 2 }, attempts: 0 });

    await expect(worker.processOne('q')).resolves.toBe(false);
    expect(queueMock.enqueue).toHaveBeenCalledWith('q', { v: 2 }, undefined);
    expect(queueMock.ack).toHaveBeenCalledWith('q', 'm2', undefined);
  });

  it('processOne does not re-enqueue when attempts >= maxAttempts', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockRejectedValue(new Error('boom')),
    });

    queueMock.dequeue.mockResolvedValueOnce({ id: 'm3', payload: { v: 3 }, attempts: 3 });

    await expect(worker.processOne('q')).resolves.toBe(false);
    expect(queueMock.enqueue).not.toHaveBeenCalled();
    expect(queueMock.ack).toHaveBeenCalledWith('q', 'm3', undefined);
  });

  it('processAll drains until dequeue returns undefined', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockResolvedValue(undefined),
    });

    queueMock.dequeue
      .mockResolvedValueOnce({ id: 'm1', payload: { v: 1 }, attempts: 0 })
      .mockResolvedValueOnce({ id: 'm2', payload: { v: 2 }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    await expect(worker.processAll('q')).resolves.toBe(2);
  });

  it('runOnce respects maxItems', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockResolvedValue(undefined),
    });

    queueMock.dequeue
      .mockResolvedValueOnce({ id: 'm1', payload: { v: 1 }, attempts: 0 })
      .mockResolvedValueOnce({ id: 'm2', payload: { v: 2 }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    await expect(worker.runOnce({ queueName: 'q', maxItems: 1 })).resolves.toBe(1);
  });

  it('runOnce drains until empty when maxItems is undefined', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockResolvedValue(undefined),
    });

    queueMock.dequeue
      .mockResolvedValueOnce({ id: 'm1', payload: { v: 1 }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    await expect(worker.runOnce({ queueName: 'q' })).resolves.toBe(1);
  });

  it('startWorker exits immediately when signal is already aborted', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockResolvedValue(undefined),
    });

    const controller = new AbortController();
    controller.abort();

    await expect(worker.startWorker({ queueName: 'q', signal: controller.signal })).resolves.toBe(
      0
    );
    expect(queueMock.dequeue).not.toHaveBeenCalled();
  });

  it('startWorker drains until empty when not aborted', async () => {
    const { createQueueWorker } = await import('@/workers/createQueueWorker');

    const worker = createQueueWorker<{ v: number }>({
      kindLabel: 'job',
      defaultQueueName: 'q',
      maxAttempts: 3,
      getLogFields: (p) => ({ v: p.v }),
      handle: vi.fn().mockResolvedValue(undefined),
    });

    queueMock.dequeue
      .mockResolvedValueOnce({ id: 'm1', payload: { v: 1 }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    await expect(worker.startWorker({ queueName: 'q' })).resolves.toBe(1);
  });
});
