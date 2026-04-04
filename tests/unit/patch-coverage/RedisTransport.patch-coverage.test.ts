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

const mockLogger = (info = vi.fn(), error = vi.fn()): void => {
  vi.doMock('@config/logger', () => ({ Logger: { info, error } }));
};

const mockSignedRequest = (createHeaders = vi.fn()): void => {
  vi.doMock('@security/SignedRequest', () => ({
    SignedRequest: {
      createHeaders,
    },
  }));
};

const mockEnv = (env: Record<string, unknown>): void => {
  vi.doMock('@config/env', () => ({ Env: env }));
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
    const createHeaders = vi.fn(async ({ url }: { url: URL }) => ({
      'x-sign-target': url.toString(),
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse('value-1'))
      .mockResolvedValueOnce(createJsonResponse('value-2'))
      .mockResolvedValueOnce(createJsonResponse([]));

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(info, error);
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
    expect(await client.get('beta')).toBe('value-2');
    expect(await client.quit()).toBe('OK');
    expect(client.on('ready', () => undefined)).toBe(client);
    expect(client.once('ready', () => undefined)).toBe(client);
    expect(client.off('ready', () => undefined)).toBe(client);
    expect(client.removeListener('ready', () => undefined)).toBe(client);

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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse('OK'))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockRejectedValueOnce(new Error('scan failed'));

    vi.stubGlobal('fetch', fetchMock);
    mockLogger(info, error);
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
    pipeline.set('a', '1').get('a');
    const results = await pipeline.exec();

    expect(results[0]).toEqual([null, 'OK']);
    expect(results[1]?.[0]).toBeInstanceOf(Error);
    expect(String(results[1]?.[0])).toContain('Redis proxy request failed (502)');

    const streamError = await waitForStreamError(client.scanStream());

    expect(streamError).toBeInstanceOf(Error);
    expect(String(streamError)).toContain('scan failed');
  });
});
