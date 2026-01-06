import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  enqueue: vi.fn(),
};

const notificationServiceMock = {
  send: vi.fn(),
  sendVia: vi.fn(),
  listDrivers: vi.fn(),
};

vi.mock('@tools/queue/Queue', () => ({
  Queue: queueMock,
  default: queueMock,
}));

vi.mock('@notification/Service', () => ({
  NotificationService: notificationServiceMock,
}));

describe('Notification (later patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.enqueue.mockResolvedValue('n-msg-1');
    notificationServiceMock.send.mockResolvedValue(undefined);
  });

  it('NotifyNow is an alias for send', async () => {
    const { Notification } = await import('@notification/Notification');

    await Notification.NotifyNow('r', 'm', { a: 1 });
    expect(notificationServiceMock.send).toHaveBeenCalledWith('r', 'm', { a: 1 });
  });

  it('NotifyLater enqueues with type/attempts and provided timestamp', async () => {
    const { Notification } = await import('@notification/Notification');

    await expect(
      Notification.NotifyLater('r', 'm', { a: 1 }, { queueName: 'q', timestamp: 123 })
    ).resolves.toBe('n-msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({
        type: 'notification',
        recipient: 'r',
        message: 'm',
        options: { a: 1 },
        timestamp: 123,
        attempts: 0,
      })
    );
  });

  it('queue(queueName).NotifyLater forces queueName and uses Date.now default timestamp', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(999);
    const { Notification } = await import('@notification/Notification');

    await Notification.queue('notifications').NotifyLater('r', 'm', { a: 1 });

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'notifications',
      expect.objectContaining({
        timestamp: 999,
        attempts: 0,
      })
    );

    nowSpy.mockRestore();
  });
});
