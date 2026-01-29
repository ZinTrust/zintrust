import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

const broadcastMock = { send: vi.fn() };
const notificationMock = { send: vi.fn() };

vi.mock('@zintrust/core', () => ({
  appConfig: {
    prefix: 'zintrust-test',
  },
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  Queue: queueMock,
  Broadcast: broadcastMock,
  Notification: notificationMock,
  NodeSingletons: {
    os: {
      cpus: () => [{ model: 'test', speed: 2400 }],
      totalmem: () => 8 * 1024 * 1024 * 1024,
      freemem: () => 4 * 1024 * 1024 * 1024,
      loadavg: () => [1, 1.5, 2],
    },
    path: {
      resolve: (...parts: string[]) => parts.join('/'),
    },
    module: {
      createRequire: vi.fn(() => ({
        resolve: vi.fn(() => '/mocked/path'),
      })),
    },
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
    pbkdf2Sync: vi.fn(),
    randomBytes: vi.fn(() => Buffer.from('test')),
  },
  generateUuid: vi.fn(() => 'test-uuid'),
}));

describe('BroadcastWorker / NotificationWorker (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('@zintrust/workers');
    vi.clearAllMocks();

    queueMock.dequeue.mockResolvedValue(undefined);
    queueMock.enqueue.mockResolvedValue('id');
    queueMock.ack.mockResolvedValue(undefined);

    broadcastMock.send.mockResolvedValue(undefined);
    notificationMock.send.mockResolvedValue(undefined);
  });

  it('BroadcastWorker.processOne uses Broadcast.send', async () => {
    const { BroadcastWorker } = await import('@zintrust/workers');

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
    const { NotificationWorker } = await import('@zintrust/workers');

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
