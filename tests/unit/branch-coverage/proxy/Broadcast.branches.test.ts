import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'BROADCAST_INTERNAL_URL',
  'BROADCAST_BRIDGE_URL',
  'BROADCAST_BRIDGE_SECRET',
  'BROADCAST_BRIDGE_PATH',
  'BROADCAST_BRIDGE_PROTOCOL',
  'APP_URL',
  'BASE_URL',
  'PUSHER_APP_ID',
  'BROADCAST_APP_ID',
  'BROADCAST_SECRET',
  'PUSHER_APP_SECRET',
  'BROADCAST_APP_SECRET',
  'DOCKER_WORKER',
  'WORKER_ISOLATED',
  'ZINTRUST_SOCKET_HOST',
  'ZINTRUST_SOCKET_PORT',
  'X_ZINTRUST_SOCKET_SEC',
  'BROADCAST_INTERNAL_PUBLISH_RETRIES',
  'BROADCAST_INTERNAL_PUBLISH_RETRY_BASE_MS',
];

const clearEnv = (): void => {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key);
};

const setEnv = (values: Record<string, string>): void => {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
};

const jsonResponse = (body: string, status = 202): Response =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

const okBody = (event = 'evt', channels: string[] = ['alpha'], deliveries = 1): string =>
  JSON.stringify({ ok: true, event, channels, deliveries });

const installBaseMocks = (): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      get: (key: string, fallback = '') => process.env[key] ?? fallback,
      getInt: (key: string, fallback: number) => {
        const raw = process.env[key];
        const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
      getBool: (key: string, fallback = false) => {
        const raw = process.env[key];
        if (raw === undefined) return fallback;
        return raw === 'true' || raw === '1';
      },
    },
  }));
  vi.doMock('@config/logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock('@common/ExternalServiceUtils', () => ({
    tracedFetch: (...args: unknown[]) => (globalThis.fetch as (...input: unknown[]) => unknown)(...args),
  }));
  vi.doMock('@broadcast/drivers/InMemory', () => ({
    InMemoryDriver: { send: vi.fn(async () => 'inmemory-ok') },
  }));
  vi.doMock('@broadcast/drivers/Pusher', () => ({ PusherDriver: { send: vi.fn() } }));
  vi.doMock('@broadcast/drivers/Redis', () => ({ RedisDriver: { send: vi.fn() } }));
  vi.doMock('@broadcast/drivers/RedisHttps', () => ({ RedisHttpsDriver: { send: vi.fn() } }));
  vi.doMock('@config/broadcast', () => ({
    default: {
      getDriverName: () => 'inmemory',
      getDriverConfig: () => ({ driver: 'inmemory' }),
    },
  }));
  vi.doMock('@tools/queue/Queue', () => ({ Queue: { enqueue: vi.fn(async () => 'msg-1') } }));
};

const installRegistry = (config: any = { driver: 'inmemory' }): void => {
  vi.doMock('@broadcast/BroadcastRegistry', () => ({
    BroadcastRegistry: { has: () => true, get: () => config },
  }));
};

const installSocket = (implementation: (input?: any) => Promise<unknown>): void => {
  vi.doMock('@zintrust/socket', () => ({
    publishSocketEventFromServer: vi.fn(implementation),
  }));
};

const loadBroadcast = async () => {
  const { Broadcast } = await import('@broadcast/Broadcast');
  return Broadcast;
};

describe('Broadcast uncovered branches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearEnv();
    installBaseMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearEnv();
  });

  it('retries transient edge statuses with zero base delay and provides socketId', async () => {
    setEnv({
      BASE_URL: 'http://127.0.0.1:7777',
      PUSHER_APP_ID: 'app-1',
      BROADCAST_INTERNAL_PUBLISH_RETRIES: '3',
      BROADCAST_INTERNAL_PUBLISH_RETRY_BASE_MS: '0',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('unreachable', 522))
      .mockResolvedValueOnce(jsonResponse(okBody('evt', ['alpha'], 5)));
    vi.stubGlobal('fetch', fetchMock);
    installSocket(async () => ({
      ok: true,
      transport: 'node',
      channels: ['alpha'],
      event: 'evt',
      deliveries: 1,
    }));

    const Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {}, socketId: 'socket-1' })
    ).resolves.toMatchObject({ transport: 'internal-http', deliveries: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      socket_id: 'socket-1',
    });
  });

  it('accepts fully-qualified persistent channels and name/data/request/user inputs', async () => {
    const { Queue } = await import('@tools/queue/Queue');
    const Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publishLater({
        channel: 'persistent-alpha',
        name: 'evt',
        request: { headers: {} } as any,
        user: { id: 1 },
      })
    ).resolves.toBe('msg-1');
    expect(Queue.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({ channels: ['persistent-alpha'], event: 'evt', data: {} })
    );
  });

  it('tries ipv6 loopback aliases before falling back', async () => {
    setEnv({
      BROADCAST_INTERNAL_URL: 'http://[::1]:7799',
      BROADCAST_APP_ID: 'persist-app',
      BROADCAST_INTERNAL_PUBLISH_RETRIES: '1',
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED ::1'))
      .mockResolvedValueOnce(jsonResponse(okBody('evt', ['persistent-alpha'], 2)));
    vi.stubGlobal('fetch', fetchMock);
    installSocket(async () => ({
      ok: true,
      transport: 'node',
      channels: ['persistent-alpha'],
      event: 'evt',
      deliveries: 2,
    }));

    const Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publish({ channel: 'alpha', scope: 'persistent', event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'internal-http',
      channels: ['persistent-alpha'],
      endpoint: 'http://127.0.0.1:7799/apps/persist-app/events',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves bridge paths, legacy hosts and optional ports', async () => {
    setEnv({
      DOCKER_WORKER: 'true',
      BROADCAST_BRIDGE_URL: 'http://bridge.local:1234',
      BROADCAST_BRIDGE_SECRET: 'bridge-secret',
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody()));
    vi.stubGlobal('fetch', fetchMock);

    let Broadcast = await loadBroadcast();
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).resolves.toMatchObject({
      transport: 'internal-http',
      endpoint: 'http://bridge.local:1234/apps/internal/events',
    });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    setEnv({
      DOCKER_WORKER: 'true',
      ZINTRUST_SOCKET_HOST: 'socket.local',
      ZINTRUST_SOCKET_PORT: '7788',
      BROADCAST_BRIDGE_PATH: 'apps/custom',
      BROADCAST_APP_ID: 'legacy-app',
    });
    const fetchMock2 = vi.fn().mockResolvedValue(jsonResponse(okBody()));
    vi.stubGlobal('fetch', fetchMock2);
    Broadcast = await loadBroadcast();
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).resolves.toMatchObject({
      transport: 'internal-http',
      endpoint: 'http://socket.local:7788/apps/custom',
    });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    setEnv({ DOCKER_WORKER: 'true', ZINTRUST_SOCKET_HOST: 'socket.local' });
    const fetchMock3 = vi.fn().mockResolvedValue(jsonResponse(okBody()));
    vi.stubGlobal('fetch', fetchMock3);
    Broadcast = await loadBroadcast();
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).resolves.toMatchObject({
      transport: 'internal-http',
      endpoint: 'http://socket.local/apps/internal/events',
    });
  });

  it('skips empty bridge endpoints and parses non-object response bodies', async () => {
    setEnv({ BROADCAST_BRIDGE_URL: '/relative', BASE_URL: 'http://127.0.0.1:7788' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('"plain text"'));
    vi.stubGlobal('fetch', fetchMock);
    installSocket(async () => ({
      ok: true,
      transport: 'node',
      channels: ['alpha'],
      event: 'evt',
      deliveries: 3,
    }));

    const Broadcast = await loadBroadcast();
    const result = await Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} });
    expect(result.transport).toBe('internal-http');
    expect(result.deliveries).toBeUndefined();
  });

  it('falls back to the driver for non-Error socket failures and forced socket delivery', async () => {
    installRegistry();
    installSocket(async () => {
      throw 'plain socket failure';
    });

    const Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {}, delivery: 'socket' })
    ).resolves.toMatchObject({ transport: 'driver', driver: 'inmemory' });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry();
    installSocket(async () => {
      throw 'plain socket failure';
    });
    const Broadcast2 = await loadBroadcast();
    await expect(Broadcast2.publish({ channel: 'alpha', event: 'evt', data: {} })).resolves.toMatchObject({
      transport: 'driver',
      driver: 'inmemory',
    });
  });

  it('covers http-bridge driver success, error and misconfiguration', async () => {
    installRegistry({
      driver: 'http-bridge',
      url: 'http://bridge.local:7787/apps/bridge-driver/events',
      secret: 'driver-secret',
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody('evt', ['alpha', 'beta'], 2)));
    vi.stubGlobal('fetch', fetchMock);

    let Broadcast = await loadBroadcast();
    await expect(
      Broadcast.broadcaster('bridge').publish({ channels: ['alpha', 'beta'], event: 'evt', data: {} })
    ).resolves.toMatchObject({
      transport: 'driver',
      driver: 'http-bridge',
      broadcaster: 'bridge',
      deliveries: 2,
    });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry({
      driver: 'http-bridge',
      url: '/relative',
      secret: 'driver-secret',
    });
    Broadcast = await loadBroadcast();
    await expect(
      Broadcast.broadcaster('bridge').publish({ channel: 'alpha', event: 'evt', data: {} })
    ).rejects.toThrow(/HTTP bridge broadcast driver misconfigured/);

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry({
      driver: 'http-bridge',
      url: 'http://bridge.local:7787/apps/bridge-driver/events',
      secret: 'driver-secret',
    });
    const fetchMock2 = vi.fn().mockRejectedValue(new Error('bridge down'));
    vi.stubGlobal('fetch', fetchMock2);
    Broadcast = await loadBroadcast();
    await expect(
      Broadcast.broadcaster('bridge').publish({ channel: 'alpha', event: 'evt', data: {} })
    ).rejects.toThrow(/bridge down/);
  });

  it('covers automatic bridge success/failure and delivery=driver publishes', async () => {
    setEnv({
      DOCKER_WORKER: 'true',
      BROADCAST_BRIDGE_URL: 'http://bridge.local:7785/apps/bridge-app/events',
      BROADCAST_BRIDGE_SECRET: 'bridge-secret',
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody('evt', ['alpha'], 4)));
    vi.stubGlobal('fetch', fetchMock);
    installRegistry({ driver: 'inmemory' });
    installSocket(async () => {
      throw new Error('socket unavailable');
    });

    let Broadcast = await loadBroadcast();
    const bridged = await Broadcast.publish({
      channel: 'alpha',
      event: 'evt',
      data: {},
      socketId: 'socket-1',
    });
    expect(bridged.deliveries).toBe(4);
    expect(bridged.attemptedTransports).toContain('internal-http');

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry();
    Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {}, delivery: 'driver' })
    ).resolves.toMatchObject({ transport: 'driver', driver: 'inmemory' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records automatic bridge failures, multiple driver results and forced socket errors', async () => {
    setEnv({
      DOCKER_WORKER: 'true',
      BROADCAST_BRIDGE_URL: 'http://bridge.local:7785/apps/bridge-app/events',
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error('bridge down'));
    vi.stubGlobal('fetch', fetchMock);
    installRegistry({ driver: 'inmemory' });
    installSocket(async () => {
      throw new Error('socket unavailable');
    });

    let Broadcast = await loadBroadcast();
    await expect(Broadcast.publish({ channel: 'alpha', event: 'evt', data: {} })).resolves.toMatchObject({
      transport: 'driver',
      driver: 'inmemory',
    });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry({ driver: 'inmemory' });
    installSocket(async () => {
      throw new Error('socket unavailable');
    });
    Broadcast = await loadBroadcast();
    await expect(
      Broadcast.broadcaster('multi').publish({
        channels: ['alpha', 'beta'],
        event: 'evt',
        data: {},
      })
    ).resolves.toMatchObject({ transport: 'driver', channels: ['alpha', 'beta'] });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry({ driver: 'inmemory' });
    installSocket(async () => {
      throw new Error('socket unavailable');
    });
    Broadcast = await loadBroadcast();
    await expect(
      Broadcast.publish({ channel: 'alpha', event: 'evt', data: {}, delivery: 'socket' })
    ).resolves.toMatchObject({ transport: 'driver', driver: 'inmemory' });
  });

  it('covers send() transport result selection and queue defaults', async () => {
    installSocket(async () => ({
      ok: true,
      transport: 'node',
      channels: ['alpha'],
      event: 'evt',
      deliveries: 7,
    }));

    let Broadcast = await loadBroadcast();
    await expect(await Broadcast.send('alpha', 'evt', {})).toMatchObject({
      ok: true,
      transport: 'node',
      deliveries: 7,
    });

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry();
    installSocket(async () => {
      throw new Error('socket unavailable');
    });
    Broadcast = await loadBroadcast();
    await expect(await Broadcast.send('alpha', 'evt', {})).toBe('inmemory-ok');

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    installRegistry();
    Broadcast = await loadBroadcast();
    await expect(await Broadcast.broadcastNow('alpha', 'evt', {})).toBe('inmemory-ok');

    vi.resetModules();
    clearEnv();
    installBaseMocks();
    Broadcast = await loadBroadcast();
    await expect(Broadcast.queue('custom').publishLater({ channel: 'alpha', event: 'evt', data: {} })).resolves.toBe(
      'msg-1'
    );
    const { Queue } = await import('@tools/queue/Queue');
    expect(Queue.enqueue).toHaveBeenCalledWith('custom', expect.any(Object));
  });
});
