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

type VerifyFn = (
  req: any,
  body: string
) => Promise<{ ok: boolean; status?: number; message?: string }>;

let capturedVerify: VerifyFn | null = null;

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
  verifyRequestSignature: vi.fn(async () => ({ ok: true })),
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
  verifyProxySignatureIfNeeded: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@proxy/ProxyServer', () => ({
  createProxyServer: vi.fn((input: { verify: VerifyFn }) => {
    capturedVerify = input.verify;
    return {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
  }),
}));

vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(() => ({
    query: vi.fn(async () => [[]]),
  })),
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
  SmtpDriver: {
    create: vi.fn(() => ({ send: vi.fn(async () => undefined) })),
  },
}));

describe('Proxy servers patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedVerify = null;
  });

  it('starts SQL proxy servers and executes verify callbacks', async () => {
    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});
    expect(capturedVerify).toBeTypeOf('function');
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');

    const { PostgresProxyServer } = await import('@proxy/postgres/PostgresProxyServer');
    await PostgresProxyServer.start({});
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');

    const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
    await SqlServerProxyServer.start({});
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');
  });

  it('starts redis/smtp/mongodb proxies and executes verify callbacks', async () => {
    const { RedisProxyServer } = await import('@proxy/redis/RedisProxyServer');
    await RedisProxyServer.start({});
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');

    const { SmtpProxyServer } = await import('@proxy/smtp/SmtpProxyServer');
    await SmtpProxyServer.start({});
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');

    const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');
    const running = await MongoDBProxyServer.start({});
    await capturedVerify?.({ headers: {}, method: 'POST', url: '/' }, '{}');
    await running.close();
  });
});
