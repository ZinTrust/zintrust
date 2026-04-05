import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

const broadcastMock = { publish: vi.fn() };
const notificationMock = { send: vi.fn() };

const queueMonitorMetricsMock = {
  recordJob: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@zintrust/queue-monitor', () => ({
  createMetrics: vi.fn(() => queueMonitorMetricsMock),
}));

vi.mock('@zintrust/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core')>();
  return {
    ...actual,
    appConfig: {
      prefix: 'zintrust-test',
    },
    queueConfig: {
      drivers: {
        redis: {
          driver: 'redis',
          host: '127.0.0.1',
          port: 6379,
          database: 0,
        },
      },
    },
    workersConfig: {
      intervalMs: 5000,
    },
    Env: {
      SSE_HEARTBEAT_INTERVAL: 15000,
    },
    Logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    Queue: queueMock,
    Broadcast: broadcastMock,
    Notification: notificationMock,
    NodeSingletons: {
      ...actual.NodeSingletons,
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
  };
});

vi.unmock('@zintrust/workers');

describe('BroadcastWorker / NotificationWorker (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.dequeue.mockResolvedValue(undefined);
    queueMock.enqueue.mockResolvedValue('id');
    queueMock.ack.mockResolvedValue(undefined);

    broadcastMock.publish.mockResolvedValue(undefined);
    notificationMock.send.mockResolvedValue(undefined);
    queueMonitorMetricsMock.recordJob.mockResolvedValue(undefined);
  });

  it('BroadcastWorker.processOne uses Broadcast.publish', async () => {
    const { BroadcastWorker } = await import('@zintrust/workers');

    queueMock.dequeue.mockResolvedValueOnce({
      id: 'b1',
      payload: { channel: 'c', event: 'e', data: { ok: true }, timestamp: 1 },
      attempts: 0,
    });

    await expect(BroadcastWorker.processOne('broadcasts')).resolves.toBe(true);
    expect(broadcastMock.publish).toHaveBeenCalledWith({
      channel: 'c',
      event: 'e',
      data: { ok: true },
    });
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
