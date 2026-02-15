import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMongoCollectionStub = (): { findOne: ReturnType<typeof vi.fn> } => ({
  findOne: vi.fn(async () => null),
});

const createMongoDbStub = (): { collection: ReturnType<typeof vi.fn> } => ({
  collection: vi.fn(() => createMongoCollectionStub()),
});

const createMongoClientStub = (): {
  connect: ReturnType<typeof vi.fn>;
  db: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} => ({
  connect: vi.fn(async () => undefined),
  db: vi.fn(() => createMongoDbStub()),
  close: vi.fn(async () => undefined),
});

type Verify = (
  req: any,
  body: string
) => Promise<{ ok: boolean; status?: number; message?: string }>;
type Backend = {
  handle: (request: {
    method: string;
    path: string;
    body: string;
  }) => Promise<{ status: number; body: unknown }>;
};

let capturedVerify: Verify | null = null;
let capturedBackend: Backend | null = null;

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/env', () => ({
  Env: {
    HOST: '127.0.0.1',
    PORT: 7772,
    MAX_BODY_SIZE: 131072,
    MYSQL_PROXY_POOL_LIMIT: 10,
    POSTGRES_PROXY_POOL_LIMIT: 10,
    get: vi.fn((k: string, d?: string) => {
      if (k === 'MAIL_HOST') return 'smtp.example.com';
      if (k === 'MAIL_USERNAME') return 'user';
      if (k === 'MAIL_PASSWORD') return 'pass';
      if (k === 'MAIL_FROM_ADDRESS') return 'no-reply@example.com';
      return d ?? '';
    }),
    getInt: vi.fn((_k: string, d?: number) => d ?? 0),
  },
}));

vi.mock('@proxy/ProxyServerUtils', () => ({
  resolveBaseConfig: vi.fn(() => ({ host: '127.0.0.1', port: 8789, maxBodyBytes: 131072 })),
  resolveBaseSigningConfig: vi.fn(() => ({
    keyId: 'kid',
    secret: 'secret',
    requireSigning: true,
    signingWindowMs: 60000,
  })),
  verifyRequestSignature: vi.fn(async () => ({
    ok: false,
    error: { status: 401, message: 'bad' },
  })),
}));

vi.mock('@proxy/ProxySigningConfigResolver', () => ({
  resolveProxySigningConfig: vi.fn(() => ({
    keyId: 'kid',
    secret: 'secret',
    requireSigning: true,
    signingWindowMs: 60000,
  })),
}));

vi.mock('@proxy/ProxySigningRequest', () => ({
  extractSigningHeaders: vi.fn(() => ({ 'x-zt-key-id': 'kid' })),
  verifyProxySignatureIfNeeded: vi.fn(async () => ({ ok: false })),
}));

vi.mock('@proxy/ProxyServer', () => ({
  createProxyServer: vi.fn((input: { verify: Verify; backend: Backend }) => {
    capturedVerify = input.verify;
    capturedBackend = input.backend;
    return {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
  }),
}));

vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(() => ({ query: vi.fn(async () => [[]]) })),
}));

vi.mock('pg', () => ({
  Pool: function Pool() {
    return { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
  },
}));

vi.mock('mssql', () => ({
  connect: vi.fn(async () => ({
    request: () => ({
      input: vi.fn(),
      query: vi.fn(async () => ({ recordset: [], rowsAffected: [0] })),
    }),
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock('mongodb', () => ({
  MongoClient: function MongoClient() {
    return createMongoClientStub();
  },
}));

vi.mock('@mail/drivers/Smtp', () => ({
  SmtpDriver: { create: vi.fn(() => ({ send: vi.fn(async () => undefined) })) },
}));

describe('Proxy servers remaining patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedVerify = null;
    capturedBackend = null;
  });

  it('covers sql/mysql/postgres/redis verify failure response branches', async () => {
    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});
    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'bad',
    });

    const { PostgresProxyServer } = await import('@proxy/postgres/PostgresProxyServer');
    await PostgresProxyServer.start({});
    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'bad',
    });

    const { RedisProxyServer } = await import('@proxy/redis/RedisProxyServer');
    await RedisProxyServer.start({});
    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'bad',
    });
  });

  it('covers sqlserver payload validation and verify failure branch', async () => {
    const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
    await SqlServerProxyServer.start({});

    const badPayload = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: 123, params: [] }),
    });
    expect(badPayload?.status).toBe(400);

    const emptySql = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: '   ', params: [] }),
    });
    expect(emptySql?.status).toBe(400);

    const validSql = await capturedBackend?.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: 'SELECT 1', params: [] }),
    });
    expect(validSql?.status).toBe(200);

    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'bad',
    });
  });

  it('covers smtp and mongodb verify fallback error mapping branches', async () => {
    const { SmtpProxyServer } = await import('@proxy/smtp/SmtpProxyServer');
    await SmtpProxyServer.start({});
    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });

    const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');
    const running = await MongoDBProxyServer.start({});
    await expect(
      capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}')
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });
    await running.close();
  });
});
