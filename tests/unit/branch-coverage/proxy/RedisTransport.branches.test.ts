import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  signedUrls: [] as URL[],
  customHeaders: undefined as any,
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const redisConfig = { host: 'localhost', port: 6379, password: undefined, db: 0 };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const rpcResponse = (body: unknown, status = 200): Response =>
  jsonResponse({ ok: status >= 200 && status < 300, ...body }, status);

type EnvOptions = {
  omitGet?: boolean;
  omitGetInt?: boolean;
  omitGetBool?: boolean;
};

const mockEnv = (env: Record<string, any>, options: EnvOptions = {}): void => {
  vi.doMock('@config/env', () => {
    const Env: Record<string, any> = { ...env };
    if (!options.omitGet) {
      Env['get'] = (key: string, fallback = '') =>
        env[key] === undefined ? fallback : String(env[key]);
    }
    if (!options.omitGetInt) {
      Env['getInt'] = (key: string, fallback: number) =>
        env[key] === undefined ? fallback : Number(env[key]);
    }
    if (!options.omitGetBool) {
      Env['getBool'] = (key: string, fallback = false) =>
        env[key] === undefined ? fallback : Boolean(env[key]);
    }
    return { Env };
  });
};

const mockDeps = (): void => {
  vi.doMock('@config/logger', () => ({
    Logger: { info: state.info, warn: state.warn, error: state.error, debug: vi.fn() },
  }));
  vi.doMock('@security/SignedRequest', () => ({
    SignedRequest: {
      createHeaders: vi.fn(async ({ url }: { url: URL }) => {
        state.signedUrls.push(url);
        return { 'x-signature': 'sig' };
      }),
    },
  }));
  vi.doMock('@orm/adapters/SqlProxyAdapterUtils', () => ({
    parseCustomHeadersFromEnv: () => state.customHeaders,
  }));
};

const baseProxyEnv = (overrides: Record<string, any> = {}): Record<string, any> => ({
  USE_REDIS_PROXY: true,
  REDIS_PROXY_URL: 'http://proxy.local/base',
  REDIS_PROXY_HOST: 'proxy.local',
  REDIS_PROXY_PORT: 8791,
  REDIS_PROXY_KEY_ID: 'kid',
  REDIS_PROXY_SECRET: 'secret',
  REDIS_PROXY_TIMEOUT_MS: 1000,
  REDIS_RPC_URL: '',
  REDIS_RPC_SECRET: '',
  REDIS_RPC_TIMEOUT_MS: 30000,
  ...overrides,
});

const waitForStream = (
  stream: {
    on: (event: string, handler: (...args: any[]) => void) => unknown;
    once: (event: string, handler: (...args: any[]) => void) => unknown;
  },
  event: 'end' | 'error'
): Promise<unknown> =>
  new Promise((resolve) => {
    stream.once(event, (value: unknown) => resolve(value));
  });

describe('RedisTransport uncovered branches', () => {
  beforeEach(() => {
    state.signedUrls = [];
    state.customHeaders = undefined;
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads env through property fallbacks when get/getBool/getInt are absent', async () => {
    mockEnv(
      {
        USE_REDIS_PROXY: true,
        REDIS_PROXY_URL: 'http://proxy.local',
        REDIS_PROXY_HOST: 'proxy.local',
        REDIS_PROXY_PORT: 8791,
        REDIS_PROXY_KEY_ID: '',
        REDIS_PROXY_SECRET: '',
        REDIS_PROXY_TIMEOUT_MS: 1000,
        ZEDGI_URL: 123,
      },
      { omitGet: true, omitGetBool: true }
    );
    mockDeps();
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ result: 'pong' }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveRedisTransportMode, createRedisProxyConnection } =
      await import('@/tools/redis/RedisTransport');
    expect(resolveRedisTransportMode()).toBe('proxy');
    const client = createRedisProxyConnection({ ...redisConfig, db: 1 }, { subsystem: 'cache' });
    await expect(client.call('PING')).resolves.toBe('pong');

    // A non-string env value falls back to the supplied default in readEnvString.
    mockEnv({ ...baseProxyEnv(), REDIS_PROXY_URL: 123 }, { omitGet: true, omitGetBool: true });
    vi.resetModules();
    mockDeps();
    const mod2 = await import('@/tools/redis/RedisTransport');
    const client2 = mod2.createRedisProxyConnection({ ...redisConfig, db: 9 }, { subsystem: 'cache' });
    await expect(client2.call('PING')).resolves.toBe('pong');
  });

  it('parses integer env values from strings, numbers, blanks and NaN fallbacks', async () => {
    mockEnv(
      {
        USE_REDIS_PROXY: true,
        REDIS_RPC_URL: 'http://rpc.local',
        REDIS_RPC_TIMEOUT_MS: 'not-a-number',
        REDIS_RPC_SECRET: '',
        REDIS_PROXY_URL: '',
        REDIS_PROXY_HOST: 'proxy.local',
        REDIS_PROXY_PORT: 8791,
        REDIS_PROXY_KEY_ID: '',
        REDIS_PROXY_SECRET: '',
        REDIS_PROXY_TIMEOUT_MS: 1000,
        NUMERIC_TIMEOUT: 42,
      },
      { omitGetInt: true }
    );
    mockDeps();
    const fetchMock = vi.fn().mockResolvedValue(rpcResponse({ result: 'pong' }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveRedisTransportMode, createRedisProxyConnection } =
      await import('@/tools/redis/RedisTransport');
    expect(resolveRedisTransportMode()).toBe('rpc');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });
    await expect(client.call('PING')).resolves.toBe('pong');
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeDefined();
  });

  it('strips signing prefixes for exact and prefixed paths and adds custom headers', async () => {
    state.customHeaders = { 'x-custom': 'value' };
    mockEnv(baseProxyEnv({ REDIS_PROXY_URL: 'http://proxy.local/zin/redis/command' }));
    mockDeps();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });
    await expect(client.call('GET', 'k')).resolves.toBe('ok');
    expect(state.signedUrls[0]?.pathname).toBe('/zin/redis/command');

    vi.resetModules();
    state.signedUrls = [];
    state.customHeaders = undefined;
    mockEnv(baseProxyEnv());
    mockDeps();
    const fetchMock2 = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock2);
    const mod2 = await import('@/tools/redis/RedisTransport');
    const client2 = mod2.createRedisProxyConnection({ ...redisConfig, db: 2 }, { subsystem: 'cache' });
    await expect(client2.call('GET', 'k')).resolves.toBe('ok');
    expect(state.signedUrls[0]?.pathname).toBe('/zin/redis/command');
    expect(fetchMock2.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-signature': 'sig' });

    vi.resetModules();
    mockEnv(baseProxyEnv({ REDIS_PROXY_URL: 'http://proxy.local/other' }));
    mockDeps();
    const fetchMock3 = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock3);
    const mod3 = await import('@/tools/redis/RedisTransport');
    const client3 = mod3.createRedisProxyConnection({ ...redisConfig, db: 3 }, { subsystem: 'cache' });
    await expect(client3.call('GET', 'k')).resolves.toBe('ok');
    expect(state.signedUrls[0]?.pathname).toBe('/zin/redis/command');
  });

  it('omits AbortSignal when unavailable and maps RPC errors and pipeline errors', async () => {
    vi.stubGlobal('AbortSignal', undefined);
    mockEnv(
      baseProxyEnv({
        USE_REDIS_PROXY: true,
        REDIS_RPC_URL: 'http://rpc.local/base',
        REDIS_RPC_SECRET: '',
      })
    );
    mockDeps();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rpcResponse({ result: 'ok' }))
      .mockResolvedValueOnce(rpcResponse({ error: { message: 'rpc failed', details: { a: 1 } } }, 400))
      .mockResolvedValueOnce(rpcResponse({ error: { message: '' } }, 500))
      .mockResolvedValueOnce(rpcResponse({ error: { message: 42 } }, 500))
      .mockResolvedValueOnce(rpcResponse({ result: [['ERR bad command', null], [null, 7]] }));
    vi.stubGlobal('fetch', fetchMock);

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });

    await expect(client.call('PING')).resolves.toBe('ok');
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-redis-rpc-secret');

    await expect(client.call('BAD')).rejects.toThrow('rpc failed');
    await expect(client.call('BAD')).rejects.toThrow(/Redis RPC request failed \(500\)/);
    await expect(client.call('BAD')).rejects.toThrow(/Redis RPC request failed \(500\)/);

    const pipeline = client.multi();
    (pipeline as any)['set']('a', '1').get('a');
    expect(await pipeline.exec()).toEqual([
      [expect.any(Error), null],
      [null, 7],
    ]);
  });

  it('normalizes scan cursors and batches and emits with no listeners', async () => {
    mockEnv(baseProxyEnv());
    mockDeps();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: ['1', ['a', 2, 'b']] }))
      .mockResolvedValueOnce(jsonResponse({ result: [42, ['c']] }))
      .mockImplementation(async () => jsonResponse({ result: [null, 'not-an-array'] }));
    vi.stubGlobal('fetch', fetchMock);

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });

    const batches: unknown[][] = [];
    const stream = client.scanStream({ match: 'a*', count: 5 });
    stream.on('data', (batch: unknown[]) => batches.push(batch));
    await waitForStream(stream, 'end');
    expect(batches).toEqual([['a', 'b'], ['c']]);

    const silentStream = client.scanStream();
    await expect(waitForStream(silentStream, 'end')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('handles non-Error pipeline failures and symbol properties on proxies', async () => {
    mockEnv(baseProxyEnv());
    mockDeps();
    const fetchMock = vi.fn().mockRejectedValue('string failure');
    vi.stubGlobal('fetch', fetchMock);

    const { createRedisProxyConnection } = await import('@/tools/redis/RedisTransport');
    const client = createRedisProxyConnection(redisConfig, { subsystem: 'cache' });

    const pipeline = client.pipeline();
    (pipeline as any)['set']('a', '1');
    const results = await pipeline.exec();
    expect(results[0]?.[0]).toBeInstanceOf(Error);

    expect((pipeline as any)[Symbol.toPrimitive]).toBeUndefined();
    expect((client as any)[Symbol.toPrimitive]).toBeUndefined();
    expect((client as any).then).toBeUndefined();
  });

  it('keeps direct mode and requireDirect checks independent of options', async () => {
    mockEnv({ USE_REDIS_PROXY: false, USE_ZEDGI: false });
    mockDeps();
    const { ensureRedisTransportMode, resolveRedisTransportMode } =
      await import('@/tools/redis/RedisTransport');
    expect(resolveRedisTransportMode()).toBe('direct');
    expect(ensureRedisTransportMode(redisConfig)).toBe('direct');
    expect(ensureRedisTransportMode(redisConfig, { subsystem: 'cache' })).toBe('direct');
  });

  it('rejects direct connections and enforces requireDirect in proxy/rpc/zedgi modes', async () => {
    mockEnv(baseProxyEnv({ USE_REDIS_PROXY: false, REDIS_RPC_URL: '' }));
    mockDeps();
    const mod = await import('@/tools/redis/RedisTransport');
    expect(() => mod.createRedisProxyConnection(redisConfig)).toThrow(/direct mode is active/);

    vi.resetModules();
    mockEnv(baseProxyEnv({ REDIS_RPC_URL: '' }));
    mockDeps();
    const proxyMod = await import('@/tools/redis/RedisTransport');
    expect(() =>
      proxyMod.ensureRedisTransportMode(redisConfig, { requireDirect: true, subsystem: 'cache' })
    ).toThrow(/requires a direct Redis connection/);

    vi.resetModules();
    mockEnv(
      baseProxyEnv({
        REDIS_RPC_URL: 'http://rpc.local',
        REDIS_RPC_SECRET: 'rpc-secret',
      })
    );
    mockDeps();
    const rpcMod = await import('@/tools/redis/RedisTransport');
    expect(rpcMod.resolveRedisTransportMode()).toBe('rpc');
    expect(rpcMod.ensureRedisTransportMode(redisConfig, { requireDirect: true })).toBe('rpc');

    vi.resetModules();
    mockEnv({ USE_ZEDGI: true, REDIS_PROXY_KEY_ID: '', REDIS_PROXY_SECRET: '' });
    mockDeps();
    const zedgiMod = await import('@/tools/redis/RedisTransport');
    zedgiMod.registerZedgiRedisExecutor(vi.fn(async () => 'ok'));
    expect(zedgiMod.resolveRedisTransportMode()).toBe('zedgi');
    expect(() =>
      zedgiMod.ensureRedisTransportMode(redisConfig, { requireDirect: true })
    ).toThrow(/requires a direct Redis connection/);
  });
});
