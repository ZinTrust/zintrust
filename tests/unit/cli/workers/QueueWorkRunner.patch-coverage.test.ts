import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

const broadcastMock = {
  send: vi.fn(),
};

const notificationMock = {
  send: vi.fn(),
};

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@config/queue', () => ({ queueConfig: {} }));

vi.mock('@tools/queue/QueueRuntimeRegistration', () => ({
  registerQueuesFromRuntimeConfig: vi.fn(),
}));

vi.mock('@tools/queue/Queue', () => ({
  Queue: queueMock,
  default: queueMock,
}));

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: broadcastMock,
  default: broadcastMock,
}));

vi.mock('@notification/Notification', () => ({
  Notification: notificationMock,
  default: notificationMock,
}));

describe('QueueWorkRunner (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.dequeue.mockResolvedValue(undefined);
    queueMock.enqueue.mockResolvedValue('msg-1');
    queueMock.ack.mockResolvedValue(undefined);

    broadcastMock.send.mockResolvedValue(undefined);
    notificationMock.send.mockResolvedValue(undefined);
  });

  it('parses kind aliases', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    expect(QueueWorkRunner.parseKind('broadcast')).toBe('broadcast');
    expect(QueueWorkRunner.parseKind('broad')).toBe('broadcast');
    expect(QueueWorkRunner.parseKind('notification')).toBe('notification');
    expect(QueueWorkRunner.parseKind('notify')).toBe('notification');

    expect(() => QueueWorkRunner.parseKind('nope')).toThrow(/Invalid kind/i);
  });

  it('auto-detects broadcast kind from payload.type and processes it', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue
      .mockResolvedValueOnce({
        id: 'm1',
        payload: {
          type: 'broadcast',
          channel: 'c',
          event: 'e',
          data: { a: 1 },
          // exercise string→number normalization for attempts/timestamp
          attempts: '0',
          timestamp: '123',
        },
        attempts: 0,
      })
      .mockResolvedValueOnce(undefined);

    const result = await QueueWorkRunner.run({ queueName: 'broadcasts' });

    expect(broadcastMock.send).toHaveBeenCalledWith('c', 'e', { a: 1 });
    expect(queueMock.ack).toHaveBeenCalledWith('broadcasts', 'm1', undefined);

    expect(result.processed).toBe(1);
    expect(result.unknown).toBe(0);
  });

  it('auto-detects notification kind from recipient/message and processes it', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue
      .mockResolvedValueOnce({
        id: 'm2',
        payload: {
          recipient: 'r',
          message: 'hello',
          options: { x: 1 },
        },
        attempts: 0,
      })
      .mockResolvedValueOnce(undefined);

    const result = await QueueWorkRunner.run({ queueName: 'notifications' });

    expect(notificationMock.send).toHaveBeenCalledWith('r', 'hello', { x: 1 });
    expect(queueMock.ack).toHaveBeenCalledWith('notifications', 'm2', undefined);
    expect(result.processed).toBe(1);
  });

  it('re-queues not-due jobs and stops after rotating the head once', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'm3',
      payload: {
        type: 'broadcast',
        channel: 'c',
        event: 'e',
        data: {},
        timestamp: 2_000,
        attempts: 0,
      },
      attempts: 0,
    });

    const result = await QueueWorkRunner.run({ queueName: 'broadcasts', kind: 'broadcast' });

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({ timestamp: 2_000 }),
      undefined
    );
    expect(queueMock.ack).toHaveBeenCalledWith('broadcasts', 'm3', undefined);
    expect(broadcastMock.send).not.toHaveBeenCalled();

    expect(result.notDueRequeued).toBe(1);

    nowSpy.mockRestore();
  });

  it('retries failed jobs by re-enqueueing with incremented attempts', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'm4',
      payload: {
        type: 'broadcast',
        channel: 'c',
        event: 'e',
        data: {},
        attempts: 0,
      },
      attempts: 0,
    });

    broadcastMock.send.mockRejectedValueOnce(new Error('boom'));

    const result = await QueueWorkRunner.run({ queueName: 'broadcasts', kind: 'broadcast' });

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({ attempts: 1 }),
      undefined
    );
    expect(queueMock.ack).toHaveBeenCalledWith('broadcasts', 'm4', undefined);

    expect(result.retried).toBe(1);
    expect(result.dropped).toBe(0);
  });

  it('drops failed jobs when retry=0 (maxAttempts=1)', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'm5',
      payload: {
        type: 'broadcast',
        channel: 'c',
        event: 'e',
        data: {},
        attempts: 0,
      },
      attempts: 0,
    });

    broadcastMock.send.mockRejectedValueOnce(new Error('boom'));

    const result = await QueueWorkRunner.run({
      queueName: 'broadcasts',
      kind: 'broadcast',
      retry: 0,
    });

    expect(queueMock.enqueue).not.toHaveBeenCalled();
    expect(queueMock.ack).toHaveBeenCalledWith('broadcasts', 'm5', undefined);
    expect(result.dropped).toBe(1);
  });

  it('acks and counts unknown payloads', async () => {
    const { QueueWorkRunner } = await import('@cli/workers/QueueWorkRunner');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'm6',
      payload: { foo: 'bar' },
      attempts: 0,
    });

    const result = await QueueWorkRunner.run({ queueName: 'q' });

    expect(queueMock.ack).toHaveBeenCalledWith('q', 'm6', undefined);
    expect(result.unknown).toBe(1);
  });
});
