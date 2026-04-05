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
    vi.unstubAllGlobals();
    delete process.env['BROADCAST_INTERNAL_URL'];
    delete process.env['APP_URL'];
    delete process.env['BASE_URL'];
    delete process.env['PUSHER_APP_ID'];
    delete process.env['BROADCAST_APP_ID'];
    delete process.env['BROADCAST_SECRET'];
    delete process.env['PUSHER_APP_SECRET'];
    delete process.env['BROADCAST_APP_SECRET'];
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

  it('publish prefers the internal socket publish route before in-process transport', async () => {
    process.env['BASE_URL'] = 'http://127.0.0.1:7777';
    process.env['PUSHER_APP_ID'] = 'app-1';
    process.env['BROADCAST_SECRET'] = 'secret-1';

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, deliveries: 4, event: 'e', channels: ['c'] }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const publishSocketEventFromServer = vi.fn(async () => ({
      ok: true,
      transport: 'node' as const,
      channels: ['c'],
      event: 'e',
      deliveries: 1,
    }));

    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer,
      socketRuntime: { isEnabled: () => true },
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'c', event: 'e', data: { a: 1 } })
    ).resolves.toMatchObject({
      transport: 'internal-http',
      deliveries: 4,
      endpoint: 'http://127.0.0.1:7777/apps/app-1/events',
      attemptedTransports: ['internal-http'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7777/apps/app-1/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-zintrust-socket-secret': 'secret-1',
          authorization: 'Bearer secret-1',
        }),
      })
    );
    expect(publishSocketEventFromServer).not.toHaveBeenCalled();
  });

  it('retries the alternate loopback host before falling back to the in-process socket transport', async () => {
    process.env['BASE_URL'] = 'http://127.0.0.1:7777';
    process.env['PUSHER_APP_ID'] = 'app-1';

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, deliveries: 2, event: 'evt', channels: ['private-smart.1'] }),
          {
            status: 202,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({
        channel: 'smart.1',
        channelScope: 'private',
        event: 'evt',
        data: { ok: true },
      })
    ).resolves.toMatchObject({
      transport: 'internal-http',
      channels: ['private-smart.1'],
      attemptedTransports: ['internal-http'],
      endpoint: 'http://localhost:7777/apps/app-1/events',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:7777/apps/app-1/events',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:7777/apps/app-1/events',
      expect.any(Object)
    );
  });

  it('throws when a fully-qualified channel conflicts with an explicit channelScope', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.publish({
        channel: 'private-smart.1',
        channelScope: 'public',
        event: 'evt',
        data: {},
      })
    ).rejects.toBeDefined();
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

  it('publishLater applies channelScope normalization before queueing', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.publishLater({
        channel: 'smart.ZTF-10514',
        channelScope: 'private',
        event: 'smart.data',
        data: { ok: true },
      })
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({
        channel: 'private-smart.ZTF-10514',
        channels: ['private-smart.ZTF-10514'],
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
