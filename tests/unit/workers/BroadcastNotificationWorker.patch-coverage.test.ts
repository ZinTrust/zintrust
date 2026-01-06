import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

const broadcastMock = { send: vi.fn() };
const notificationMock = { send: vi.fn() };

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

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: broadcastMock,
  default: broadcastMock,
}));

vi.mock('@notification/Notification', () => ({
  Notification: notificationMock,
  default: notificationMock,
}));

describe('BroadcastWorker / NotificationWorker (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.dequeue.mockResolvedValue(undefined);
    queueMock.enqueue.mockResolvedValue('id');
    queueMock.ack.mockResolvedValue(undefined);

    broadcastMock.send.mockResolvedValue(undefined);
    notificationMock.send.mockResolvedValue(undefined);
  });

  it('BroadcastWorker.processOne uses Broadcast.send', async () => {
    const { BroadcastWorker } = await import('@/workers/BroadcastWorker');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'b1',
      payload: { channel: 'c', event: 'e', data: { ok: true }, timestamp: 1 },
      attempts: 0,
    });

    await expect(BroadcastWorker.processOne('broadcasts')).resolves.toBe(true);
    expect(broadcastMock.send).toHaveBeenCalledWith('c', 'e', { ok: true });
    expect(queueMock.ack).toHaveBeenCalledWith('broadcasts', 'b1', undefined);
  });

  it('NotificationWorker.processOne uses Notification.send', async () => {
    const { NotificationWorker } = await import('@/workers/NotificationWorker');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'n1',
      payload: { recipient: 'r', message: 'm', options: { x: 1 }, timestamp: 1 },
      attempts: 0,
    });

    await expect(NotificationWorker.processOne('notifications')).resolves.toBe(true);
    expect(notificationMock.send).toHaveBeenCalledWith('r', 'm', { x: 1 });
    expect(queueMock.ack).toHaveBeenCalledWith('notifications', 'n1', undefined);
  });
});
