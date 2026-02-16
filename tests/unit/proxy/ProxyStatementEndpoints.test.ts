import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedBackend: any = null;

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const envValues = new Map<string, string>();

vi.mock('@config/env', () => ({
  Env: {
    HOST: '127.0.0.1',
    PORT: 7772,
    MAX_BODY_SIZE: 131072,
    MYSQL_PROXY_POOL_LIMIT: 10,
    POSTGRES_PROXY_POOL_LIMIT: 10,
    get: vi.fn((k: string, d?: string) => envValues.get(k) ?? d ?? ''),
    getBool: vi.fn((_k: string, d?: boolean) => d ?? false),
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
  createProxyServer: vi.fn((input: { backend: unknown }) => {
    capturedBackend = input.backend;
    return {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
  }),
}));

const mysqlQuery = vi.fn(async () => [[{ ok: 1 }]]);
vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(() => ({ query: mysqlQuery })),
}));

const pgQuery = vi.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }));
vi.mock('pg', () => ({
  Pool: function Pool() {
    return { query: pgQuery };
  },
}));

const sqlQuery = vi.fn(async () => ({ recordset: [{ ok: 1 }], rowsAffected: [1] }));
vi.mock('mssql', () => ({
  connect: vi.fn(async () => ({
    request: () => ({
      input: vi.fn(),
      query: sqlQuery,
    }),
    close: vi.fn(async () => undefined),
  })),
}));

describe('Proxy /statement endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    envValues.clear();
    capturedBackend = null;
    mysqlQuery.mockResolvedValue([[{ ok: 1 }]]);
    pgQuery.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });
    sqlQuery.mockResolvedValue({ recordset: [{ ok: 1 }], rowsAffected: [1] });
  });

  it('mysql /statement returns CONFIG_ERROR when registry missing', async () => {
    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/statement',
      headers: {},
      body: JSON.stringify({ statementId: 'x', params: [] }),
    });

    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe('CONFIG_ERROR');
  });

  it('mysql /statement executes SELECT and returns rows shape', async () => {
    envValues.set('ZT_MYSQL_STATEMENTS_JSON', JSON.stringify({ s1: 'select 1 as ok' }));

    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});

    mysqlQuery.mockResolvedValueOnce([[{ ok: 1 }]]);

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/statement',
      headers: {},
      body: JSON.stringify({ statementId: 's1', params: [] }),
    });

    expect(resp.status).toBe(200);
    expect(resp.body.rows).toEqual([{ ok: 1 }]);
    expect(resp.body.rowCount).toBe(1);
  });

  it('mysql /statement executes INSERT and returns ok/meta shape', async () => {
    envValues.set(
      'ZT_MYSQL_STATEMENTS_JSON',
      JSON.stringify({ i1: 'insert into t(a) values (?)' })
    );

    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    await MySqlProxyServer.start({});

    mysqlQuery.mockResolvedValueOnce([{ affectedRows: 2, insertId: 5 } as any]);

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/statement',
      headers: {},
      body: JSON.stringify({ statementId: 'i1', params: ['x'] }),
    });

    expect(resp.status).toBe(200);
    expect(resp.body.ok).toBe(true);
    expect(resp.body.meta.changes).toBe(2);
    expect(resp.body.meta.lastRowId).toBe(5);
  });

  it('postgres /statement returns NOT_FOUND for unknown statementId', async () => {
    envValues.set('ZT_POSTGRES_STATEMENTS_JSON', JSON.stringify({ s1: 'select 1' }));

    const { PostgresProxyServer } = await import('@proxy/postgres/PostgresProxyServer');
    await PostgresProxyServer.start({});

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/statement',
      headers: {},
      body: JSON.stringify({ statementId: 'missing', params: [] }),
    });

    expect(resp.status).toBe(404);
    expect(resp.body.code).toBe('NOT_FOUND');
  });

  it('postgres /statement executes SELECT and returns rows shape', async () => {
    envValues.set('ZT_POSTGRES_STATEMENTS_JSON', JSON.stringify({ s1: 'select 1 as ok' }));

    const { PostgresProxyServer } = await import('@proxy/postgres/PostgresProxyServer');
    await PostgresProxyServer.start({});

    pgQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/statement',
      headers: {},
      body: JSON.stringify({ statementId: 's1', params: [] }),
    });

    expect(resp.status).toBe(200);
    expect(resp.body.rows).toEqual([{ ok: 1 }]);
    expect(resp.body.rowCount).toBe(1);
  });

  it('sqlserver /statement executes UPDATE and returns ok/meta shape', async () => {
    envValues.set(
      'ZT_SQLSERVER_STATEMENTS_JSON',
      JSON.stringify({ u1: 'update t set a=? where id=?' })
    );

    const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
    await SqlServerProxyServer.start({});

    sqlQuery.mockResolvedValueOnce({ recordset: [], rowsAffected: [3] });

    const resp = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/statement',
      headers: {},
      body: JSON.stringify({ statementId: 'u1', params: ['x', 1] }),
    });

    expect(resp.status).toBe(200);
    expect(resp.body.ok).toBe(true);
    expect(resp.body.meta.changes).toBe(3);
  });
});
