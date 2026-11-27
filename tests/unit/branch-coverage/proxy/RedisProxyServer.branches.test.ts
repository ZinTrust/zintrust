import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: any[]) => void;

const H = vi.hoisted(() => ({
  env: {} as Record<string, string | number>,
  baseConfig: { host: '127.0.0.1', port: 8791, maxBodyBytes: 131072 } as any,
  signingConfig: {
    keyId: 'kid',
    secret: 'secret',
    requireSigning: false,
    signingWindowMs: 60000,
  } as any,
  verifyResult: { ok: true } as any,
  redisAvailable: true,
  clientSpec: {} as any,
  clients: [] as any[],
  lastRedisOptions: undefined as any,
  capturedBackend: null as any,
  capturedVerify: null as any,
  capturedInput: null as any,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  emitRedis: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback?: string) => {
      const value = H.env[key];
      return value === undefined ? (fallback ?? '') : String(value);
    },
    getInt: (key: string, fallback: number) => {
      const value = H.env[key];
      const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
  },
}));

vi.mock('@config/logger', () => ({ Logger: H.logger }));

vi.mock('@proxy/ProxyServerUtils', () => ({
  resolveBaseConfig: (overrides: any) => ({
    ...H.baseConfig,
    ...(overrides?.host === undefined ? {} : { host: overrides.host }),
    ...(overrides?.port === undefined ? {} : { port: overrides.port }),
    ...(overrides?.maxBodyBytes === undefined ? {} : { maxBodyBytes: overrides.maxBodyBytes }),
  }),
  resolveBaseSigningConfig: () => H.signingConfig,
  verifyRequestSignature: vi.fn(async () => H.verifyResult),
}));

vi.mock('@proxy/ProxyServer', () => ({
  createProxyServer: vi.fn((input: any) => {
    H.capturedInput = input;
    H.capturedBackend = input.backend;
    H.capturedVerify = input.verify;
    return { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
  }),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: { emitRedis: H.emitRedis },
}));

vi.mock('ioredis', () => {
  const RedisCtor = function (this: unknown, options: any) {
    H.lastRedisOptions = options;
    const spec = H.clientSpec ?? {};
    const listeners: Record<string, Listener[]> = {};
    const client: any = {
      options,
      listeners,
      on: vi.fn((event: string, listener: Listener) => {
        (listeners[event] ??= []).push(listener);
        return client;
      }),
      emit: (event: string, ...args: unknown[]) => {
        for (const listener of listeners[event] ?? []) listener(...args);
      },
      quit: spec.quit ?? vi.fn(async () => 'OK'),
      ...(spec.connect === false ? {} : { connect: spec.connect ?? vi.fn(async () => undefined) }),
    };
    if (spec.ping !== false) {
      client.ping = spec.ping ?? vi.fn(async () => 'PONG');
    }
    if (spec.call !== false) {
      client.call = spec.call ?? vi.fn(async () => 'called');
    }
    Object.assign(client, spec.methods ?? {});
    H.clients.push(client);
    return client;
  };

  return {
    get Redis() {
      return H.redisAvailable ? RedisCtor : undefined;
    },
    get default() {
      return H.redisAvailable ? { Redis: RedisCtor } : {};
    },
  };
});

import { RedisProxyServer } from '@proxy/redis/RedisProxyServer';

const post = (body: unknown, path = '/zin/redis/command', method = 'POST') => ({
  method,
  path,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const startServer = async (overrides?: any): Promise<void> => {
  if (overrides === undefined) {
    await RedisProxyServer.start();
  } else {
    await RedisProxyServer.start(overrides);
  }
};

describe('RedisProxyServer uncovered branches', () => {
  beforeEach(() => {
    H.env = {};
    H.baseConfig = { host: '127.0.0.1', port: 8791, maxBodyBytes: 131072 };
    H.signingConfig = {
      keyId: 'kid',
      secret: 'secret',
      requireSigning: false,
      signingWindowMs: 60000,
    };
    H.verifyResult = { ok: true };
    H.redisAvailable = true;
    H.clientSpec = {};
    H.clients = [];
    H.lastRedisOptions = undefined;
    H.capturedBackend = null;
    H.capturedVerify = null;
    H.capturedInput = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolves redis settings from env fallbacks and from explicit overrides', async () => {
    H.env = {
      REDIS_PROXY_TARGET_HOST: 'env-target',
      REDIS_HOST: 'env-fallback',
      REDIS_PROXY_TARGET_PORT: 1234,
      REDIS_PORT: 4567,
      REDIS_PROXY_TARGET_PASSWORD: 'env-pass',
      REDIS_PASSWORD: 'fallback-pass',
      REDIS_PROXY_TARGET_DB: 3,
      REDIS_DB: 4,
    };
    H.clientSpec = { methods: { get: vi.fn(async () => 'value') } };

    await startServer();
    expect(H.capturedInput).toMatchObject({
      host: '127.0.0.1',
      port: 8791,
      maxBodyBytes: 131072,
    });

    const envResult = await H.capturedBackend.handle(post({ command: 'get', args: ['k'] }));
    expect(envResult).toEqual({ status: 200, body: { result: 'value' } });
    expect(H.lastRedisOptions).toMatchObject({
      host: 'env-target',
      port: 1234,
      password: 'env-pass',
      db: 3,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    await startServer({
      host: 'proxy-host',
      port: 9999,
      maxBodyBytes: 42,
      redisHost: 'override-host',
      redisPort: 4321,
      redisPassword: 'override-pass',
      redisDb: 7,
    });
    expect(H.capturedInput).toMatchObject({ host: 'proxy-host', port: 9999, maxBodyBytes: 42 });

    H.clientSpec = { methods: { get: vi.fn(async () => 'override-value') } };
    const overrideResult = await H.capturedBackend.handle(post({ command: 'get', args: ['k'] }));
    expect(overrideResult.status).toBe(200);
    expect(H.lastRedisOptions).toMatchObject({
      host: 'override-host',
      port: 4321,
      password: 'override-pass',
      db: 7,
    });
  });

  it('validates command payloads (missing args, non-string command, blank command)', async () => {
    H.clientSpec = { methods: { get: vi.fn(async () => 'ok') } };
    await startServer({});

    const withoutArgs = await H.capturedBackend.handle(post({ command: 'get' }));
    expect(withoutArgs.status).toBe(200);
    expect(H.clientSpec.methods.get).toHaveBeenCalledWith();

    const nonString = await H.capturedBackend.handle(post({ command: 42 }));
    expect(nonString).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'command is required' },
    });

    const blank = await H.capturedBackend.handle(post({ command: '   ' }));
    expect(blank.status).toBe(400);
  });

  it('returns 405, 404 and 400 for method, endpoint and JSON errors', async () => {
    await startServer({});

    expect((await H.capturedBackend.handle(post({}, '/zin/redis/command', 'GET'))).status).toBe(405);
    expect((await H.capturedBackend.handle(post({ command: 'GET' }, '/zin/redis/other'))).status).toBe(
      404
    );
    expect((await H.capturedBackend.handle(post('{'))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);
  });

  it('handles missing constructors, retry limits, error throttling and absent connect', async () => {
    await startServer({});

    // No Redis constructor available -> error is converted into a 500 response.
    H.redisAvailable = false;
    const failed = await H.capturedBackend.handle(post({ command: 'GET' }));
    expect(failed.status).toBe(500);
    const unhealthy = await H.capturedBackend.health();
    expect(unhealthy.status).toBe(503);
    H.redisAvailable = true;
    H.clientSpec = { methods: { get: vi.fn(async () => 'ok') } };
    await H.capturedBackend.handle(post({ command: 'get', args: ['k'] }));

    // Retry strategy: cap reached returns null, otherwise a bounded delay.
    const retryStrategy = H.lastRedisOptions?.retryStrategy;
    expect(retryStrategy).toBeTypeOf('function');
    expect(retryStrategy(9)).toBeNull();
    expect(retryStrategy(2)).toBe(400);
    expect(H.lastRedisOptions.reconnectOnError(new Error('retry me'))).toBe(false);

    // Error listener throttling: first error logs, second inside 5s is ignored.
    H.logger.warn.mockClear();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(10000).mockReturnValueOnce(12000);
    H.clients[H.clients.length - 1].emit('error', new Error('boom'));
    H.clients[H.clients.length - 1].emit('error', new Error('boom again'));
    expect(H.logger.warn).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();

    // Client without connect() should still be usable.
    H.clientSpec = { connect: false, methods: { get: vi.fn(async () => 'no-connect') } };
    const result = await H.capturedBackend.handle(post({ command: 'get', args: ['k'] }));
    expect(result.status).toBe(200);
  });

  it('executes commands via a named method, via call(), and rejects unsupported commands', async () => {
    await startServer({});

    H.clientSpec = { methods: { get: vi.fn(async () => 'method-value') } };
    expect((await H.capturedBackend.handle(post({ command: ' GET ', args: ['k'] }))).body).toEqual({
      result: 'method-value',
    });

    H.clientSpec = { call: vi.fn(async () => 'call-value') };
    const viaCall = await H.capturedBackend.handle(post({ command: 'custom', args: [1] }));
    expect(viaCall.body).toEqual({ result: 'call-value' });
    expect(H.clientSpec.call).toHaveBeenCalledWith('custom', 1);

    H.clientSpec = { call: false };
    const unsupported = await H.capturedBackend.handle(post({ command: 'custom', args: [] }));
    expect(unsupported.status).toBe(500);
    expect(String(JSON.stringify(unsupported.body))).toContain('Internal server error');
    expect(H.logger.error).toHaveBeenCalled();
  });

  it('uses ping() in health checks and falls back to executeCommand without ping', async () => {
    await startServer({});

    H.clientSpec = { ping: vi.fn(async () => 'PONG') };
    expect(await H.capturedBackend.health()).toEqual({
      status: 200,
      body: { status: 'healthy' },
    });
    expect(H.clientSpec.ping).toHaveBeenCalledTimes(1);

    H.clientSpec = { ping: false, call: vi.fn(async () => 'PONG') };
    expect((await H.capturedBackend.health()).status).toBe(200);
    expect(H.clientSpec.call).toHaveBeenCalledWith('PING');
  });

  it('maps signature verification outcomes into the verify callback', async () => {
    await startServer({});
    const request = { headers: {}, method: 'POST', url: '/' } as any;

    H.verifyResult = { ok: false, error: { status: 403, message: 'bad signature' } };
    expect(await H.capturedVerify(request, '{}')).toEqual({
      ok: false,
      status: 403,
      message: 'bad signature',
    });

    H.verifyResult = { ok: false };
    expect(await H.capturedVerify(request, '{}')).toEqual({ ok: true });

    H.verifyResult = { ok: true };
    expect(await H.capturedVerify(request, '{}')).toEqual({ ok: true });
  });
});
