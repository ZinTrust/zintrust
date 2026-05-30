import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitQuery, emitMail, emitRedis, emitCache, emitEvent } = vi.hoisted(() => ({
  emitQuery: vi.fn(),
  emitMail: vi.fn(),
  emitRedis: vi.fn(),
  emitCache: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitCache,
    emitEvent,
    emitQuery,
    emitMail,
    emitRedis,
  },
}));

vi.mock('@/trace/SystemTraceWorkerBridge', () => ({
  SystemTraceWorkerBridge: {
    emitCache,
    emitEvent,
    emitQuery,
  },
}));

describe('proxy trace integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('emits SQL traces from the MySQL proxy server', async () => {
    let capturedBackend: { handle: (request: unknown) => Promise<{ status: number }> } | undefined;
    const poolQueryMock = vi.fn(async () => [[{ ok: true }]]);

    vi.doMock('mysql2/promise', () => ({
      createPool: () => ({
        query: (...args: unknown[]) => poolQueryMock(...args),
      }),
    }));

    vi.doMock('@proxy/SqlProxyServerDeps', () => {
      const toProxyError = (status: number, code: string, message: string) => ({
        status,
        body: { code, message },
      });

      return {
        Env: {
          MYSQL_PROXY_POOL_LIMIT: 10,
          get: (_k: string, fallback = '') => fallback,
          getInt: (_k: string, fallback: number) => fallback,
        },
        Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        ErrorHandler: { toProxyError },
        resolveBaseConfig: () => ({ host: '127.0.0.1', port: 1, maxBodyBytes: 1_000_000 }),
        resolveBaseSigningConfig: () => ({
          keyId: 'kid',
          secret: 'secret',
          requireSigning: false,
          signingWindowMs: 60_000,
        }),
        loadStatementRegistry: () => undefined,
        validateProxyRequest: () => null,
        parseJsonBody: (raw: string) => ({ value: JSON.parse(raw) }),
        validateSqlPayload: (payload: Record<string, unknown>) => ({
          valid: true,
          sql: String(payload['sql'] ?? ''),
          params: Array.isArray(payload['params']) ? payload['params'] : [],
        }),
        resolveStatementOrError: vi.fn(),
        verifyRequestSignature: async () => ({ ok: true }),
        createProxyServer: ({ backend }: { backend: typeof capturedBackend }) => {
          capturedBackend = backend;
          return { start: vi.fn(async () => undefined) };
        },
      };
    });

    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});

    const response = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/mysql/query',
      body: JSON.stringify({ sql: 'select * from users where id = ?', params: [7] }),
    });

    expect(response?.status).toBe(200);
    expect(emitQuery).toHaveBeenCalledWith(
      'select * from users where id = ?',
      [7],
      expect.any(Number),
      'mysql-proxy'
    );
  });

  it('emits SQL traces from the D1 proxy worker', async () => {
    vi.doMock('@proxy/CloudflareProxyShared', () => ({
      getEnvInt: (_env: unknown, _key: string, fallback: number) => fallback,
      json: (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      normalizeBindingName: (value: unknown) => value,
      readAndVerifyJson: async (_request: Request, _env: unknown) => ({
        ok: true,
        payload: { sql: 'select * from accounts where id = ?', params: [9] },
      }),
      toErrorResponse: (status: number, code: string, message: string) =>
        new Response(JSON.stringify({ code, message }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    }));

    const db = {
      prepare: (_sql: string) => {
        const statement = {
          bind: (..._values: unknown[]) => statement,
          all: async () => ({ results: [{ ok: true }] }),
          first: async () => ({ ok: true }),
          run: async () => ({ meta: { changes: 1 } }),
        };

        return statement;
      },
    };

    const { ZintrustD1Proxy } = await import('@proxy/d1/ZintrustD1Proxy');
    const response = await ZintrustD1Proxy.fetch(
      new Request('https://example.test/zin/d1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'ignored by mock', params: [] }),
      }),
      {
        DB: db,
        APP_KEY: 'secret',
      }
    );

    expect(response.status).toBe(200);
    expect(emitQuery).toHaveBeenCalledWith(
      'select * from accounts where id = ?',
      [9],
      expect.any(Number),
      'd1-proxy'
    );
  });

  it('emits mail traces from the SMTP proxy server', async () => {
    let capturedBackend: { handle: (request: unknown) => Promise<{ status: number }> } | undefined;
    const smtpSend = vi.fn(async () => ({ ok: true }));

    vi.doMock('@mail/drivers/Smtp', () => ({
      SmtpDriver: {
        send: smtpSend,
      },
    }));

    vi.doMock('@proxy/ProxyServer', () => ({
      createProxyServer: ({ backend }: { backend: typeof capturedBackend }) => {
        capturedBackend = backend;
        return { start: vi.fn(async () => undefined) };
      },
    }));

    vi.doMock('@proxy/SigningService', () => ({
      SigningService: {
        shouldVerify: () => false,
        normalizeConfig: (config: unknown) => config,
      },
      normalizeSigningCredentials: (value: unknown) => value,
    }));

    vi.doMock('@proxy/ProxySigningRequest', () => ({
      extractSigningHeaders: () => ({}),
      verifyProxySignatureIfNeeded: async () => ({ ok: true }),
    }));

    const { SmtpProxyServer } = await import('@proxy/smtp/SmtpProxyServer');
    await SmtpProxyServer.start({
      smtpHost: 'smtp.example.test',
      smtpPort: 587,
    });

    const response = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/smtp/send',
      body: JSON.stringify({
        message: {
          to: 'user@example.com',
          from: { email: 'noreply@example.com' },
          subject: 'Proxy mail',
          text: 'plain body',
          html: '<p>html body</p>',
        },
      }),
    });

    expect(response?.status).toBe(200);
    expect(smtpSend).toHaveBeenCalled();
    expect(emitMail).toHaveBeenCalledWith(
      'user@example.com',
      'Proxy mail',
      undefined,
      'plain body',
      '<p>html body</p>'
    );
  });

  it.skip('emits redis traces from the Redis proxy server', async () => {
    let capturedBackend: { handle: (request: unknown) => Promise<{ status: number }> } | undefined;

    const redisGet = vi.fn(async () => 'value');
    const redisQuit = vi.fn(async () => undefined);
    const redisOn = vi.fn();
    const redisConnect = vi.fn(async () => undefined);

    class MockRedis {
      get(...args: unknown[]) {
        return redisGet(...args);
      }

      quit() {
        return redisQuit();
      }

      on(...args: unknown[]) {
        return redisOn(...args);
      }

      connect() {
        return redisConnect();
      }
    }

    vi.doMock('ioredis', () => ({
      __esModule: true,
      Redis: MockRedis,
      default: MockRedis,
    }));

    vi.doMock('@proxy/ProxyServer', () => ({
      createProxyServer: ({ backend }: { backend: typeof capturedBackend }) => {
        capturedBackend = backend;
        return { start: vi.fn(async () => undefined) };
      },
    }));

    vi.doMock('@proxy/ProxyServerUtils', () => ({
      resolveBaseConfig: () => ({ host: '127.0.0.1', port: 1, maxBodyBytes: 1024 }),
      resolveBaseSigningConfig: () => ({
        keyId: 'kid',
        secret: 'secret',
        requireSigning: false,
        signingWindowMs: 60_000,
      }),
      verifyRequestSignature: async () => ({ ok: true }),
    }));

    vi.doMock('@zintrust/queue-monitor/driver', () => ({
      createBullMQDriver: vi.fn(() => ({
        getRecentJobsForQueue: vi.fn(async () => []),
        close: vi.fn(async () => undefined),
      })),
    }));

    vi.doMock('@zintrust/queue-monitor/metrics', () => ({
      createMetrics: vi.fn(() => ({
        getQueueStats: vi.fn(async () => ({})),
      })),
    }));

    vi.doMock('@zintrust/queue-monitor/QueueMonitoringService', () => ({
      getRecentJobsForQueue: vi.fn(async () => []),
      getRecentJobsForSelection: vi.fn(async () => []),
    }));

    vi.doMock('@zintrust/workers/dashboard/workers-api', () => ({
      getWorkers: vi.fn(async () => []),
      getWorkerDetails: vi.fn(async () => ({})),
      toggleAutoStart: vi.fn(async () => undefined),
    }));

    vi.doMock('@zintrust/workers/WorkerFactory', () => ({
      WorkerFactory: {
        listPersistedRecords: vi.fn(async () => []),
        listFileBackedRecords: vi.fn(async () => []),
        getPersisted: vi.fn(async () => ({})),
        getHealth: vi.fn(async () => ({})),
        getMetrics: vi.fn(async () => ({})),
      },
    }));

    const { RedisProxyServer } = await import('@proxy/redis/RedisProxyServer');
    await RedisProxyServer.start({});

    const response = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/redis/command',
      body: JSON.stringify({ command: 'GET', args: ['cache:key'] }),
    });

    expect(response?.status).toBe(200);
    expect(emitRedis).toHaveBeenCalledWith('GET', expect.any(Number));
  });

  it('emits cache and event traces from the KV proxy worker', async () => {
    vi.doMock('@proxy/CloudflareProxyShared', () => ({
      getEnvInt: (_env: unknown, _key: string, fallback: number) => fallback,
      json: (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      normalizeBindingName: (value: unknown) => value,
      readAndVerifyJson: async (request: Request) => ({
        ok: true,
        payload: JSON.parse(await request.text()),
      }),
      toErrorResponse: (status: number, code: string, message: string) =>
        new Response(JSON.stringify({ code, message }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    }));

    const cache = {
      get: vi.fn(async () => ({ ok: true })),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({
        keys: [{ name: 'pfx:users:1' }],
        cursor: '',
        list_complete: true,
      })),
    };

    const { ZintrustKvProxy } = await import('@proxy/kv/ZintrustKvProxy');

    const getResponse = await ZintrustKvProxy.fetch(
      new Request('https://example.test/zin/kv/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: 'users', key: '1', type: 'json' }),
      }),
      { CACHE: cache, APP_KEY: 'secret', ZT_KV_PREFIX: 'pfx' }
    );

    const listResponse = await ZintrustKvProxy.fetch(
      new Request('https://example.test/zin/kv/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: 'users', prefix: '', limit: 10 }),
      }),
      { CACHE: cache, APP_KEY: 'secret', ZT_KV_PREFIX: 'pfx' }
    );

    expect(getResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(emitCache).toHaveBeenCalledWith(
      'get',
      'pfx:users:1',
      expect.any(Number),
      true,
      { ok: true },
      'kv-proxy'
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'kv-proxy.list',
      1,
      expect.objectContaining({ prefix: 'pfx:users:' })
    );
  });

  it('emits event traces from the Mongo proxy server', async () => {
    let capturedBackend:
      | {
          handle: (request: unknown) => Promise<{ status: number }>;
          health?: () => Promise<unknown>;
        }
      | undefined;

    const findOne = vi.fn(async () => ({ _id: '1' }));
    const collection = { findOne };
    const dbFactory = vi.fn(() => ({
      collection: vi.fn(() => collection),
    }));

    const client = {
      connect: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      db: dbFactory,
    };

    vi.doMock('mongodb', () => ({
      MongoClient: class {
        connect = client.connect;
        close = client.close;
        db = client.db;
      },
    }));

    vi.doMock('@proxy/ProxyServer', () => ({
      createProxyServer: ({ backend }: { backend: typeof capturedBackend }) => {
        capturedBackend = backend;
        return { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
      },
    }));

    vi.doMock('@proxy/ProxySigningRequest', () => ({
      verifyProxySignatureIfNeeded: async () => ({ ok: true }),
    }));

    const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');
    const running = await MongoDBProxyServer.start({
      mongoUri: 'mongodb://example.test',
      mongoDb: 'app',
    });

    const response = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/mongodb/operation',
      body: JSON.stringify({
        operation: 'findOne',
        collection: 'users',
        args: { filter: { _id: '1' } },
      }),
    });

    expect(response?.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(
      'mongodb-proxy.operation',
      1,
      expect.objectContaining({ operation: 'findOne', collection: 'users' })
    );

    await running.close();
  });
});
