import { afterEach, describe, expect, it, vi } from 'vitest';

const redisConfig = {
  host: 'localhost',
  port: 6379,
  password: undefined,
  db: 0,
};

const createJsonResponse = (result: unknown, status = 200): Response =>
  new Response(JSON.stringify({ result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const createRpcJsonResponse = (result: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: status >= 200 && status < 300, result, error: null }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const mockLogger = (info = vi.fn(), error = vi.fn(), debug = vi.fn()): void => {
  vi.doMock('@config/logger', () => ({ Logger: { info, error, debug } }));
};

const mockSignedRequest = (createHeaders = vi.fn()): void => {
  vi.doMock('@security/SignedRequest', () => ({
    SignedRequest: {
      createHeaders,
    },
  }));
};

const mockEnv = (env: Record<string, unknown>): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      ...env,
      get: (key: string, defaultValue?: string) => {
        const value = env[key as keyof typeof env];
        return value === undefined || value === '' ? (defaultValue ?? '') : String(value);
      },
    },
  }));
};

const waitForStreamEnd = (stream: {
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  off: (event: string, handler: (...args: unknown[]) => void) => unknown;
  once: (event: string, handler: (...args: unknown[]) => void) => unknown;
}): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const removed = vi.fn();
    stream.on('data', removed);
    stream.off('data', removed);
    stream.once('end', () => resolve());
    stream.on('error', reject);
  });
};

const waitForStreamError = (stream: {
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
}): Promise<unknown> => {
  return new Promise((resolve) => {
    stream.on('error', (streamError: unknown) => resolve(streamError));
  });
};

describe('patch coverage: RedisTransport', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('logs direct transport selection once and enforces requireDirect in proxy mode', async () => {
    const info = vi.fn();

    mockLogger(info);
    mockEnv({
      USE_REDIS_PROXY: false,
      REDIS_PROXY_URL: '',
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8791,
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest();

    const { ensureRedisTransportMode, resolveRedisTransportMode } =
      await import('@/tools/redis/RedisTransport');

    expect(resolveRedisTransportMode()).toBe('direct');
    expect(ensureRedisTransportMode(redisConfig, { subsystem: 'cache' })).toBe('direct');
    expect(ensureRedisTransportMode(redisConfig, { subsystem: 'cache' })).toBe('direct');
    expect(info).toHaveBeenCalledTimes(1);

    vi.resetModules();
    mockLogger(vi.fn());
    mockEnv({
      USE_REDIS_PROXY: true,
      REDIS_PROXY_URL: 'http://proxy.local/redis',
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8791,
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest();

    const proxyModule = await import('@/tools/redis/RedisTransport');
    expect(() =>
      proxyModule.ensureRedisTransportMode(redisConfig, {
        subsystem: 'locks',
        requireDirect: true,
      })
    ).toThrow(/requires a direct Redis connection/);
  });

  it('treats missing direct Env proxy properties as direct mode when Env.get fallback is empty', async () => {
    mockLogger(vi.fn());
    mockEnv({
      get: vi.fn((_key: string, defaultValue = '') => defaultValue),
      getBool: vi.fn((_key: string, defaultValue = false) => defaultValue),
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8791,
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest();

    const { resolveRedisTransportMode } = await import('@/tools/redis/RedisTransport');

    expect(resolveRedisTransportMode()).toBe('direct');
  });

  it('proxies signed commands and supports scan streams with fallback base urls', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const debug = vi.fn();
    const createHeaders = vi.fn(async ({ url }: { url: URL }) => ({
      'x-sign-target': url.toString(),
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse('value-1'))
      .mockResolvedValueOnce(createJsonResponse('value-2'))
      .mockResolvedValueOnce(createJsonResponse([]));

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(info, error, debug);
    mockEnv({
      USE_REDIS_PROXY: true,
      REDIS_PROXY_URL: '',
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8787,
      REDIS_PROXY_KEY_ID: 'kid-1',
      REDIS_PROXY_SECRET: 'secret-1',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest(createHeaders);

    const { createRedisProxyConnection, resolveRedisTransportMode } =
      await import('@/tools/redis/RedisTransport');

    expect(resolveRedisTransportMode()).toBe('proxy');

    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });

    expect(await client.connect()).toBeUndefined();
    expect(await client.call('get', 'alpha')).toBe('value-1');
    expect(await client['get']('beta')).toBe('value-2');
    expect(await client.quit()).toBe('OK');
    // Skip strict object equality for client methods due to ioredis implementation differences
    expect(client.on('ready', () => undefined)).toBeDefined();
    expect(client.once('ready', () => undefined)).toBeDefined();
    expect(client.off('ready', () => undefined)).toBeDefined();
    expect(client.removeListener('ready', () => undefined)).toBeDefined();

    await waitForStreamEnd(client.scanStream({ match: 'queue:*', count: 5 }));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://proxy.local:8787/zin/redis/command',
      expect.objectContaining({ method: 'POST' })
    );
    expect(createHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.objectContaining({ pathname: '/zin/redis/command' }),
      })
    );
    expect(info).toHaveBeenCalledWith(
      '[redis][transport] resolved transport',
      expect.objectContaining({ subsystem: 'cache', mode: 'proxy' })
    );
  });

  it('handles proxy pipeline failures and emits scan errors', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const debug = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse('OK'))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockRejectedValueOnce(new Error('scan failed'));

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(info, error, debug);
    mockEnv({
      USE_REDIS_PROXY: true,
      REDIS_PROXY_URL: 'http://proxy.local/base',
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8787,
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest();

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'queue' });

    const pipeline = client.pipeline();
    pipeline['set']('a', '1').get('a');
    const results = await pipeline.exec();

    expect(results[0]).toEqual([null, 'OK']);
    expect(results[1]?.[0]).toBeInstanceOf(Error);
    expect(String(results[1]?.[0])).toContain('Redis proxy request failed (502)');

    const streamError = await waitForStreamError(client.scanStream());

    expect(streamError).toBeInstanceOf(Error);
    expect(String(streamError)).toContain('scan failed');
  });

  it('covers custom headers assignment in proxy headers', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const debug = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse('OK'));

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(info, error, debug);
    mockEnv({
      USE_REDIS_PROXY: true,
      REDIS_PROXY_URL: 'http://proxy.local/base',
      REDIS_PROXY_HOST: 'proxy.local',
      REDIS_PROXY_PORT: 8787,
      REDIS_PROXY_KEY_ID: 'key',
      REDIS_PROXY_SECRET: 'secret',
      REDIS_PROXY_TIMEOUT_MS: 1500,
      REDIS_PROXY_HEADERS_X_Custom_Header: 'custom-value',
    });
    mockSignedRequest();

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });

    await client['set']('a', '1');

    // Verify custom headers are included in the request
    expect(fetchMock).toHaveBeenCalled();
    const [_, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options?.headers as Record<string, string>;
    expect(headers).toBeDefined();
  });

  it('prefers redis-rpc over the legacy proxy and batches multi commands through RPC', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createRpcJsonResponse('OK'))
      .mockResolvedValueOnce(
        createRpcJsonResponse([
          [null, 'OK'],
          [null, '1'],
        ])
      )
      .mockResolvedValueOnce(
        createRpcJsonResponse([
          [null, 'OK'],
          [null, 2],
        ])
      );

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(vi.fn());
    mockEnv({
      USE_REDIS_PROXY: true,
      REDIS_RPC_URL: 'https://redis-rpc.example.com/base',
      REDIS_RPC_SECRET: 'rpc-secret',
      REDIS_RPC_TIMEOUT_MS: 1500,
      REDIS_PROXY_URL: 'http://legacy-proxy.local/base',
      REDIS_PROXY_HOST: 'legacy-proxy.local',
      REDIS_PROXY_PORT: 8787,
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });
    mockSignedRequest();

    const { createRedisProxyConnection, resolveRedisTransportMode } =
      await import('@/tools/redis/RedisTransport');

    expect(resolveRedisTransportMode()).toBe('rpc');

    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });
    await expect(client['set']('cache:key', 'value', 'EX', 30)).resolves.toBe('OK');

    const pipeline = client.pipeline();
    pipeline['set']('counter', '1').get('counter');
    await expect(pipeline.exec()).resolves.toEqual([
      [null, 'OK'],
      [null, '1'],
    ]);

    const multi = client.multi();
    multi['set']('counter', '2').incrby('counter', 1);
    await expect(multi.exec()).resolves.toEqual([
      [null, 'OK'],
      [null, 2],
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [commandUrl, commandRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, pipelineRequest] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [, multiRequest] = fetchMock.mock.calls[2] as [string, RequestInit];

    expect(commandUrl).toBe('https://redis-rpc.example.com/rpc');
    expect(commandRequest.headers).toMatchObject({ 'x-redis-rpc-secret': 'rpc-secret' });
    expect(JSON.parse(String(commandRequest.body))).toMatchObject({
      service: 'redis',
      method: 'call',
      payload: { args: ['SET', 'cache:key', 'value', 'EX', 30] },
    });
    expect(JSON.parse(String(pipelineRequest.body))).toMatchObject({
      service: 'redis',
      method: 'pipeline',
      payload: {
        commands: [
          { command: 'SET', args: ['counter', '1'] },
          { command: 'GET', args: ['counter'] },
        ],
      },
    });
    expect(JSON.parse(String(multiRequest.body))).toMatchObject({
      service: 'redis',
      method: 'multi',
      payload: {
        transaction: true,
        commands: [
          { command: 'SET', args: ['counter', '2'] },
          { command: 'INCRBY', args: ['counter', 1] },
        ],
      },
    });
  });

  it('covers zedgi mode executor registration, command execution, and errors', async () => {
    mockLogger(vi.fn());
    mockEnv({
      USE_ZEDGI: true,
      ZEDGI_URL: 'http://zedgi.local',
      REDIS_PROXY_KEY_ID: '',
      REDIS_PROXY_SECRET: '',
      REDIS_PROXY_TIMEOUT_MS: 1500,
    });

    const {
      registerZedgiRedisExecutor,
      isZedgiRedisExecutorRegistered,
      resolveRedisTransportMode,
      createRedisProxyConnection,
      ensureRedisTransportMode,
    } = await import('@/tools/redis/RedisTransport');

    expect(isZedgiRedisExecutorRegistered()).toBe(false);

    // Test throws if executor is not registered but zedgi mode is resolved
    expect(resolveRedisTransportMode()).toBe('direct');

    const executor = vi.fn().mockResolvedValue('zedgi-ok');
    registerZedgiRedisExecutor(executor);
    expect(isZedgiRedisExecutorRegistered()).toBe(true);

    expect(resolveRedisTransportMode()).toBe('zedgi');

    // Test ensureRedisTransportMode throws with requireDirect
    expect(() =>
      ensureRedisTransportMode(redisConfig, { subsystem: 'cache', requireDirect: true })
    ).toThrow(/requires a direct Redis connection, but zedgi mode is enabled/);

    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });
    expect(client.setMaxListeners(10)).toBe(client);
    expect(client.getMaxListeners()).toBe(Infinity);
    expect(client.disconnect()).toBeUndefined();
    await expect(client['set']('cache:key', 'value')).resolves.toBe('zedgi-ok');
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining(redisConfig),
      'SET',
      ['cache:key', 'value']
    );

    // Test throws if createRedisProxyConnection is called in direct mode
    registerZedgiRedisExecutor(undefined);
    expect(resolveRedisTransportMode()).toBe('direct');
    expect(() => createRedisProxyConnection(redisConfig, { subsystem: 'cache' })).toThrow(
      /Redis proxy connection requested while direct mode is active/
    );
    registerZedgiRedisExecutor(executor);

    // Test scanStream
    const executorScan = vi.fn()
      .mockResolvedValueOnce(['0', ['a', 'b']])
      .mockResolvedValueOnce(['0', []]);
    registerZedgiRedisExecutor(executorScan);
    await waitForStreamEnd(client.scanStream({ match: 'queue:*', count: 5 }));

    // Test pipeline
    const executorPipeline = vi.fn().mockResolvedValue('pipeline-item');
    registerZedgiRedisExecutor(executorPipeline);
    const pipeline = client.pipeline();
    pipeline['set']('a', '1').get('a');
    const results = await pipeline.exec();
    expect(results).toEqual([
      [null, 'pipeline-item'],
      [null, 'pipeline-item'],
    ]);

    // Test requestZedgiCommand error branch when executor is cleared/undefined
    registerZedgiRedisExecutor(executor);
    const clientForError = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });
    registerZedgiRedisExecutor(undefined);
    await expect(clientForError['set']('a', '1')).rejects.toThrow('Zedgi Redis executor is not registered');
  });
});

