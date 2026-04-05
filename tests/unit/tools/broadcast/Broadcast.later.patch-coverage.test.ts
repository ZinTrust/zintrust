import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  enqueue: vi.fn(),
};

vi.mock('@tools/queue/Queue', () => ({
  Queue: queueMock,
  default: queueMock,
}));

vi.mock('@broadcast/drivers/InMemory', () => ({
  InMemoryDriver: { send: vi.fn().mockResolvedValue('ok') },
}));

vi.mock('@broadcast/drivers/Pusher', () => ({
  PusherDriver: { send: vi.fn() },
}));
vi.mock('@broadcast/drivers/Redis', () => ({
  RedisDriver: { send: vi.fn() },
}));
vi.mock('@broadcast/drivers/RedisHttps', () => ({
  RedisHttpsDriver: { send: vi.fn() },
}));

vi.mock('@config/broadcast', () => ({
  default: {
    getDriverName: () => 'inmemory',
    getDriverConfig: () => ({ driver: 'inmemory' }),
  },
}));

describe('Broadcast (later + now patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.enqueue.mockResolvedValue('msg-1');
  });

  it('broadcastNow delegates to send()', async () => {
    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: () => true,
        get: () => ({ driver: 'inmemory' }),
      },
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.broadcastNow('c', 'e', { a: 1 })).resolves.toBe('ok');
  });

  it('publish uses the socket runtime automatically when available', async () => {
    const publishSocketEventFromServer = vi.fn(async () => ({
      ok: true,
      transport: 'node' as const,
      channels: ['c'],
      event: 'e',
      deliveries: 2,
    }));

    vi.doMock('@zintrust/socket', () => ({
      socketRuntime: { isEnabled: () => true },
      publishSocketEventFromServer,
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'c', event: 'e', data: { a: 1 } })
    ).resolves.toMatchObject({
      transport: 'socket',
      deliveries: 2,
      channels: ['c'],
      event: 'e',
    });

    expect(publishSocketEventFromServer).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['c'],
        event: 'e',
        data: { a: 1 },
      })
    );
  });

  it('BroadcastLater enqueues with type/attempts and provided timestamp', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.BroadcastLater('c', 'e', { a: 1 }, { queueName: 'q', timestamp: 123 })
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({
        type: 'broadcast',
        channel: 'c',
        event: 'e',
        data: { a: 1 },
        timestamp: 123,
        attempts: 0,
      })
    );
  });

  it('publishLater enqueues object input with normalized broadcast metadata', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.publishLater(
        {
          channels: ['alpha', 'beta'],
          event: 'evt',
          data: { a: 1 },
          delivery: 'socket',
          broadcaster: 'redis',
          socketId: 'socket-1',
        },
        { queueName: 'q2', timestamp: 321 }
      )
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'q2',
      expect.objectContaining({
        type: 'broadcast',
        channel: 'alpha',
        channels: ['alpha', 'beta'],
        event: 'evt',
        data: { a: 1 },
        delivery: 'socket',
        broadcaster: 'redis',
        socketId: 'socket-1',
        timestamp: 321,
        attempts: 0,
      })
    );
  });

  it('queue(queueName).BroadcastLater forces queueName and uses Date.now default timestamp', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(999);
    const { Broadcast } = await import('@broadcast/Broadcast');

    await Broadcast.queue('broadcasts').BroadcastLater('c', 'e', { a: 1 });

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({
        timestamp: 999,
        attempts: 0,
      })
    );

    nowSpy.mockRestore();
  });
});
