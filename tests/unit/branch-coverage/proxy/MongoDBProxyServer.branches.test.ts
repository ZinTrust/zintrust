/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  env: {} as Record<string, any>,
  signingConfig: {
    keyId: 'kid',
    secret: 'secret',
    requireSigning: false,
    signingWindowMs: 60000,
  } as any,
  mongoAvailable: true,
  collectionMethods: {} as Record<string, any>,
  clientDbThrows: false,
  clients: [] as any[],
  lastCollectionName: undefined as any,
  lastDbName: undefined as any,
  lastMongoUri: undefined as any,
  capturedBackend: null as any,
  capturedVerify: null as any,
  capturedServer: null as any,
  verifyResult: { ok: true } as any,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  emitEvent: vi.fn(),
}));

vi.mock('@config/env', () => {
  const Env: Record<string, unknown> = new Proxy(
    {
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
    {
      get(target: Record<string, unknown>, key: string | symbol) {
        if (key in target) return target[key as string];
        return H.env[key as string];
      },
    }
  );
  return { Env };
});

vi.mock('@config/logger', () => ({ Logger: H.logger }));

vi.mock('@proxy/ProxySigningConfigResolver', () => ({
  resolveProxySigningConfig: () => H.signingConfig,
}));

vi.mock('@proxy/ProxySigningRequest', () => ({
  extractSigningHeaders: vi.fn(() => ({ 'x-zt-key-id': 'kid' })),
  verifyProxySignatureIfNeeded: vi.fn(async () => H.verifyResult),
}));

vi.mock('@proxy/ProxyServer', () => ({
  createProxyServer: vi.fn((input: any) => {
    H.capturedBackend = input.backend;
    H.capturedVerify = input.verify;
    const server = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
    H.capturedServer = server;
    return server;
  }),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: { emitEvent: H.emitEvent },
}));

vi.mock('mongodb', () => {
  const MongoClient = function (uri: string) {
    H.lastMongoUri = uri;
    const collection: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_target, prop) =>
          typeof prop === 'string' ? H.collectionMethods[prop] : Reflect.get({}, prop),
      }
    );
    const collectionFn = vi.fn((name: string) => {
      H.lastCollectionName = name;
      return collection;
    });
    const client = {
      connect: vi.fn(async () => undefined),
      db: vi.fn((name: string) => {
        H.lastDbName = name;
        if (H.clientDbThrows) throw new Error('db unavailable');
        return { collection: collectionFn };
      }),
      close: vi.fn(async () => undefined),
    };
    H.clients.push(client);
    return client;
  };

  return {
    get MongoClient() {
      return H.mongoAvailable ? MongoClient : undefined;
    },
  };
});

import { MongoDBProxyServer } from '@proxy/mongodb/MongoDBProxyServer';

const post = (body: unknown, path = '/zin/mongodb/operation', method = 'POST') => ({
  method,
  path,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('MongoDBProxyServer uncovered branches', () => {
  beforeEach(() => {
    H.env = {};
    H.signingConfig = {
      keyId: 'kid',
      secret: 'secret',
      requireSigning: false,
      signingWindowMs: 60000,
    };
    H.mongoAvailable = true;
    H.collectionMethods = {};
    H.clientDbThrows = false;
    H.clients = [];
    H.lastCollectionName = undefined;
    H.lastDbName = undefined;
    H.lastMongoUri = undefined;
    H.capturedBackend = null;
    H.capturedVerify = null;
    H.capturedServer = null;
    H.verifyResult = { ok: true };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves proxy and mongo config from env and explicit overrides', async () => {
    H.env = {
      HOST: 'env-host',
      PORT: 4000,
      MAX_BODY_SIZE: 1024,
      MONGODB_PROXY_HOST: 'proxy-host',
      MONGODB_PROXY_PORT: 5000,
      MONGODB_PROXY_MAX_BODY_BYTES: 2048,
      MONGO_URI: 'mongodb://env:27017',
      MONGO_DB: 'env-db',
    };

    let running = await MongoDBProxyServer.start();
    expect(H.lastMongoUri).toBe('mongodb://env:27017');
    expect(H.capturedServer).toBeTruthy();
    await running.close();

    running = await MongoDBProxyServer.start({
      host: 'override-host',
      port: 6000,
      maxBodyBytes: 4096,
      mongoUri: 'mongodb://override:27017',
      mongoDb: 'override-db',
    });
    expect(H.lastMongoUri).toBe('mongodb://override:27017');
    await running.close();
  });

  it('rejects startup when the MongoDB driver is unavailable', async () => {
    H.mongoAvailable = false;
    await expect(MongoDBProxyServer.start()).rejects.toThrow(/MongoDB driver is unavailable/);
  });

  it('validates operation, collection and args payload fields', async () => {
    await MongoDBProxyServer.start();

    expect((await H.capturedBackend.handle(post({ collection: 'c' }))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({ operation: 42, collection: 'c' }))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({ operation: '  ', collection: 'c' }))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({ operation: 'find' }))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({ operation: 'find', collection: [] }))).status).toBe(400);
    expect(
      (await H.capturedBackend.handle(post({ operation: 'find', collection: '  ' }))).status
    ).toBe(400);

    H.collectionMethods['find'] = vi.fn(async () => 'no-args');
    const result = await H.capturedBackend.handle(post({ operation: 'find', collection: 'c' }));
    expect(result.status).toBe(200);
    expect(H.collectionMethods['find']).toHaveBeenCalledWith({});
  });

  it('handles cursor results, non-function methods and unsupported operations', async () => {
    await MongoDBProxyServer.start();

    const toArray = vi.fn(async () => ['one', 'two']);
    H.collectionMethods['find'] = vi.fn(() => ({ toArray }));
    const cursorResult = await H.capturedBackend.handle(
      post({ operation: 'find', collection: 'c', args: { filter: { a: 1 } } })
    );
    expect(cursorResult.body.result).toEqual(['one', 'two']);
    expect(toArray).toHaveBeenCalled();

    H.collectionMethods['findOne'] = vi.fn(() => ({ toArray: 'not-a-function' }));
    const nonFunctionToArray = await H.capturedBackend.handle(
      post({ operation: 'findOne', collection: 'c' })
    );
    expect(nonFunctionToArray.status).toBe(200);

    H.collectionMethods['countDocuments'] = 'not-a-method';
    const noMethod = await H.capturedBackend.handle(
      post({ operation: 'countDocuments', collection: 'c' })
    );
    expect(noMethod.status).toBe(500);
    expect(String(JSON.stringify(noMethod.body))).toContain('Method countDocuments not found');

    const unsupported = await H.capturedBackend.handle(
      post({ operation: 'dropDatabase', collection: 'c' })
    );
    expect(unsupported.status).toBe(500);
    expect(String(JSON.stringify(unsupported.body))).toContain('Unsupported MongoDB operation');
  });

  it('covers argument fallbacks for every supported operation handler', async () => {
    await MongoDBProxyServer.start();

    const marker = { provided: true };
    const cases: Array<{
      operation: string;
      method: string;
      fallback: unknown[];
      providedArgs: unknown[];
    }> = [
      { operation: 'find', method: 'find', fallback: [{}], providedArgs: [marker] },
      { operation: 'findOne', method: 'findOne', fallback: [{}], providedArgs: [marker] },
      { operation: 'insertOne', method: 'insertOne', fallback: [{}], providedArgs: [marker] },
      { operation: 'insertMany', method: 'insertMany', fallback: [[]], providedArgs: [[marker]] },
      { operation: 'updateOne', method: 'updateOne', fallback: [{}, {}], providedArgs: [marker, marker] },
      { operation: 'updateMany', method: 'updateMany', fallback: [{}, {}], providedArgs: [marker, marker] },
      { operation: 'deleteOne', method: 'deleteOne', fallback: [{}], providedArgs: [marker] },
      { operation: 'deleteMany', method: 'deleteMany', fallback: [{}], providedArgs: [marker] },
      { operation: 'countDocuments', method: 'countDocuments', fallback: [{}], providedArgs: [marker] },
      { operation: 'aggregate', method: 'aggregate', fallback: [[]], providedArgs: [[marker]] },
    ];

    for (const { operation, method, fallback, providedArgs } of cases) {
      const fn = vi.fn(async () => 'ok');
      H.collectionMethods[method] = fn;
      expect(
        (await H.capturedBackend.handle(post({ operation, collection: 'c' }))).status
      ).toBe(200);
      expect(fn).toHaveBeenCalledWith(...fallback);

      expect(
        (
          await H.capturedBackend.handle(
            post({
              operation,
              collection: 'c',
              args: {
                filter: marker,
                document: marker,
                documents: [marker],
                update: marker,
                pipeline: [marker],
              },
            })
          )
        ).status
      ).toBe(200);
      expect(fn).toHaveBeenLastCalledWith(...providedArgs);
    }
  });

  it('returns early for method/path/JSON errors and covers health and verify', async () => {
    let running = await MongoDBProxyServer.start();

    expect((await H.capturedBackend.handle(post({}, '/zin/mongodb/operation', 'GET'))).status).toBe(405);
    expect((await H.capturedBackend.handle(post({}, '/zin/mongodb/other'))).status).toBe(404);
    expect((await H.capturedBackend.handle(post('{'))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);

    expect(await H.capturedBackend.health()).toEqual({ status: 200, body: { status: 'ok' } });

    H.verifyResult = { ok: false, error: { status: 403, message: 'bad signature' } };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({
      ok: false,
      status: 403,
      message: 'bad signature',
    });
    H.verifyResult = { ok: false };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });
    await running.close();
    expect(H.capturedServer.stop).toHaveBeenCalled();
    expect(H.clients[0].close).toHaveBeenCalled();

    running = await MongoDBProxyServer.start();
    H.clientDbThrows = true;
    expect((await H.capturedBackend.health()).status).toBe(503);
    await running.close();
  });
});
