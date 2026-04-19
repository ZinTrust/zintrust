import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  enqueue: vi.fn(),
};

const resetBroadcastEnv = (): void => {
  delete process.env['BROADCAST_INTERNAL_URL'];
  delete process.env['BROADCAST_BRIDGE_URL'];
  delete process.env['BROADCAST_BRIDGE_SECRET'];
  delete process.env['BROADCAST_BRIDGE_PATH'];
  delete process.env['BROADCAST_BRIDGE_PROTOCOL'];
  delete process.env['APP_URL'];
  delete process.env['BASE_URL'];
  delete process.env['PUSHER_APP_ID'];
  delete process.env['BROADCAST_APP_ID'];
  delete process.env['BROADCAST_SECRET'];
  delete process.env['PUSHER_APP_SECRET'];
  delete process.env['BROADCAST_APP_SECRET'];
  delete process.env['DOCKER_WORKER'];
  delete process.env['WORKER_ISOLATED'];
  delete process.env['ZINTRUST_SOCKET_HOST'];
  delete process.env['ZINTRUST_SOCKET_PORT'];
  delete process.env['X_ZINTRUST_SOCKET_SEC'];
};

const setBroadcastEnv = (values: Record<string, string>): void => {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
};

const createJsonResponse = (body: string, status = 202): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });

const installSocketMock = (
  implementation?: () => Promise<unknown>
): { publishSocketEventFromServer: ReturnType<typeof vi.fn> } => {
  const publishSocketEventFromServer = vi.fn(
    implementation ??
      (async () => ({
        ok: true,
        transport: 'node' as const,
        channels: ['c'],
        event: 'e',
        deliveries: 1,
      }))
  );

  vi.doMock('@zintrust/socket', () => ({
    publishSocketEventFromServer,
  }));

  return { publishSocketEventFromServer };
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
    resetBroadcastEnv();
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
  }, 30000);

  it('publish uses the socket runtime automatically when available', async () => {
    const publishSocketEventFromServer = vi.fn(async () => ({
      ok: true,
      transport: 'node' as const,
      channels: ['c'],
      event: 'e',
      deliveries: 2,
    }));

    vi.doMock('@zintrust/socket', () => ({ publishSocketEventFromServer }));

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
    setBroadcastEnv({
      BASE_URL: 'http://127.0.0.1:7777',
      PUSHER_APP_ID: 'app-1',
      BROADCAST_SECRET: 'secret-1',
    });

    const fetchMock = vi.fn(async () =>
      createJsonResponse(JSON.stringify({ ok: true, deliveries: 4, event: 'e', channels: ['c'] }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const { publishSocketEventFromServer } = installSocketMock();

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

  it('automatically bridges isolated inmemory broadcasts over configured HTTP bridge endpoints', async () => {
    setBroadcastEnv({
      DOCKER_WORKER: 'true',
      BROADCAST_BRIDGE_URL: 'http://127.0.0.1:7785/apps/bridge-app/events',
      BROADCAST_BRIDGE_SECRET: 'bridge-secret',
    });

    const fetchMock = vi.fn(async () =>
      createJsonResponse(
        JSON.stringify({ ok: true, deliveries: 5, event: 'evt', channels: ['private-smart.1'] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { publishSocketEventFromServer } = installSocketMock();

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
      endpoint: 'http://127.0.0.1:7785/apps/bridge-app/events',
      attemptedTransports: ['internal-http'],
      deliveries: 5,
      channels: ['private-smart.1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7785/apps/bridge-app/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-zintrust-socket-secret': 'bridge-secret',
          authorization: 'Bearer bridge-secret',
        }),
      })
    );
    expect(publishSocketEventFromServer).not.toHaveBeenCalled();
  });

  it('retries the alternate loopback host before falling back to the in-process socket transport', async () => {
    setBroadcastEnv({ BASE_URL: 'http://127.0.0.1:7777', PUSHER_APP_ID: 'app-1' });

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1'))
      .mockResolvedValueOnce(
        createJsonResponse(
          JSON.stringify({ ok: true, deliveries: 2, event: 'evt', channels: ['private-smart.1'] })
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

  it('keeps channels unchanged for public or invalid scope values', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.publishLater({
        channels: ['alpha', 'beta'],
        channelScope: 'public',
        event: 'evt',
        data: { ok: true },
      })
    ).resolves.toBe('msg-1');

    await expect(
      Broadcast.publishLater({
        channel: 'gamma',
        channelScope: 'unsupported' as never,
        event: 'evt',
        data: { ok: true },
      })
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenNthCalledWith(
      1,
      'broadcasts',
      expect.objectContaining({ channels: ['alpha', 'beta'] })
    );
    expect(queueMock.enqueue).toHaveBeenNthCalledWith(
      2,
      'broadcasts',
      expect.objectContaining({ channels: ['gamma'] })
    );
  });

  it('rejects publishes without any channel input', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(Broadcast.publish({ event: 'evt', data: {} })).rejects.toBeDefined();
  });

  it('accepts host-only app urls and parses empty internal-http responses', async () => {
    setBroadcastEnv({ APP_URL: '127.0.0.1:7788', BROADCAST_APP_ID: 'internal-app' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => createJsonResponse(''))
    );

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'public.feed', event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'internal-http',
      channels: ['public.feed'],
      event: 'evt',
      endpoint: 'http://127.0.0.1:7788/apps/internal-app/events',
    });
  });

  it('parses raw internal-http error bodies and falls back to the socket transport', async () => {
    setBroadcastEnv({ BASE_URL: 'http://127.0.0.1:7788', PUSHER_APP_ID: 'internal-app' });
    const loggerWarn = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { debug: vi.fn(), info: vi.fn(), warn: loggerWarn, error: vi.fn() },
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => createJsonResponse('not-json', 500))
    );
    installSocketMock(async () => ({
      ok: true,
      transport: 'node' as const,
      channels: ['alpha'],
      event: 'evt',
      deliveries: 3,
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'socket',
      attemptedTransports: ['internal-http', 'socket'],
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      'Broadcast publish transport failed; falling back.',
      expect.objectContaining({
        transport: 'internal-http',
        body: { raw: 'not-json' },
      })
    );
  });

  it('tries localhost and ipv6 loopback aliases before falling back to the driver', async () => {
    setBroadcastEnv({ APP_URL: 'http://localhost:7788', PUSHER_APP_ID: 'loopback-app' });
    const fetchMock = vi.fn().mockRejectedValue('boom');
    const loggerWarn = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { debug: vi.fn(), info: vi.fn(), warn: loggerWarn, error: vi.fn() },
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw new Error('Socket runtime is not enabled.');
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'driver',
      attemptedTransports: ['internal-http', 'socket', 'driver'],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:7788/apps/loopback-app/events',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7788/apps/loopback-app/events',
      expect.any(Object)
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Broadcast publish transport failed; falling back.',
      expect.objectContaining({ transport: 'internal-http', error: 'boom' })
    );
  });

  it('rethrows the last socket transport error when delivery requires sockets', async () => {
    const socketError = new Error('socket transport failed');
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw socketError;
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {}, delivery: 'socket' })
    ).rejects.toBe(socketError);
  });

  it('supports persistent scope and ipv6 broadcast internal urls', async () => {
    setBroadcastEnv({
      BROADCAST_INTERNAL_URL: 'http://[::1]:7799',
      BROADCAST_APP_ID: 'persist-app',
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED ::1'))
      .mockResolvedValueOnce(
        createJsonResponse(
          JSON.stringify({ ok: true, event: 'evt', channels: ['persistent-alpha'] })
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'alpha', scope: 'persistent', name: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'internal-http',
      channels: ['persistent-alpha'],
      endpoint: 'http://127.0.0.1:7799/apps/persist-app/events',
    });
  });

  it('supports the explicit http-bridge broadcaster', async () => {
    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: () => true,
        get: () => ({
          driver: 'http-bridge',
          url: 'http://127.0.0.1:7787/apps/bridge-driver/events',
          secret: 'driver-secret',
        }),
      },
    }));

    const fetchMock = vi.fn(async () =>
      createJsonResponse(
        JSON.stringify({ ok: true, deliveries: 2, event: 'evt', channels: ['alpha', 'beta'] })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.broadcaster('bridge').publish({
        channels: ['alpha', 'beta'],
        event: 'evt',
        data: { ok: true },
      })
    ).resolves.toMatchObject({
      transport: 'driver',
      driver: 'http-bridge',
      endpoint: 'http://127.0.0.1:7787/apps/bridge-driver/events',
      deliveries: 2,
      channels: ['alpha', 'beta'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('publishLater keeps channels authoritative and stores channel only as derived compatibility metadata', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.publishLater({
        channels: ['private-user.10', 'private-user.11'],
        event: 'session.revoked',
        data: { byAdmin: true },
      })
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({
        channel: 'private-user.10',
        channels: ['private-user.10', 'private-user.11'],
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

  it('rethrows FORBIDDEN socket errors in auto delivery mode instead of falling back to driver', async () => {
    const forbiddenError = Object.assign(new Error('Socket publish not authorized'), {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw forbiddenError;
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'private-alpha', event: 'evt', data: {} })
    ).rejects.toBe(forbiddenError);
  });

  it('rethrows UNAUTHORIZED socket errors in auto delivery mode instead of falling back to driver', async () => {
    const unauthorizedError = Object.assign(new Error('Socket publish authentication required'), {
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw unauthorizedError;
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'presence-room', event: 'evt', data: {} })
    ).rejects.toBe(unauthorizedError);
  });

  it('rethrows VALIDATION_ERROR socket errors in auto delivery mode instead of falling back to driver', async () => {
    const validationError = Object.assign(new Error('Invalid socket publish payload'), {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw validationError;
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).rejects.toBe(
      validationError
    );
  });

  it('rethrows SECURITY_ERROR socket errors in auto delivery mode instead of falling back to driver', async () => {
    const securityError = Object.assign(new Error('Socket security policy violation'), {
      code: 'SECURITY_ERROR',
      statusCode: 401,
    });
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw securityError;
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).rejects.toBe(
      securityError
    );
  });

  it('falls back to driver for plain socket errors (socket unavailable) in auto delivery mode', async () => {
    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: () => true,
        get: () => ({ driver: 'inmemory' }),
      },
    }));
    vi.doMock('@zintrust/socket', () => ({
      publishSocketEventFromServer: vi.fn(async () => {
        throw new Error('Socket runtime is not enabled.');
      }),
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'driver',
      attemptedTransports: expect.arrayContaining(['socket', 'driver']),
    });
  });
});
