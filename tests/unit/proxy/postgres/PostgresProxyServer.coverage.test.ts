import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedBackend: any;

const poolQueryMock = vi.fn();
vi.mock('pg', () => ({
  Pool: class {
    query(sql: string, params?: unknown[]) {
      return poolQueryMock(sql, params);
    }
  },
}));

vi.mock('@proxy/SqlProxyServerDeps', () => {
  const toProxyError = (status: number, code: string, message: string) => ({
    status,
    body: { code, message },
  });
  const Env = {
    DB_HOST: '127.0.0.1',
    DB_PORT_POSTGRESQL: 5432,
    DB_DATABASE_POSTGRESQL: 'postgres',
    DB_USERNAME_POSTGRESQL: 'postgres',
    DB_PASSWORD_POSTGRESQL: '',
    POSTGRES_PROXY_POOL_LIMIT: 10,
  };

  return {
    Env,
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ErrorHandler: { toProxyError },
    resolveBaseConfig: () => ({ host: '127.0.0.1', port: 1, maxBodyBytes: 1_000_000 }),
    resolveBaseSigningConfig: () => ({
      keyId: 'kid',
      secret: 'secret',
      requireSigning: false,
      signingWindowMs: 60000,
    }),
    loadStatementRegistry: () => undefined,
    validateProxyRequest: () => null,
    parseJsonBody: (raw: string) => {
      try {
        return { value: JSON.parse(raw) };
      } catch {
        return toProxyError(400, 'BAD_JSON', 'Invalid JSON');
      }
    },
    validateSqlPayload: (payload: Record<string, unknown>) => {
      if (payload['sql'] === 'invalid') {
        return { valid: false, error: { code: 'BAD_SQL', message: 'bad' } };
      }
      return { valid: true, sql: String(payload['sql'] ?? ''), params: payload['params'] as any };
    },
    resolveStatementOrError: (_statements: any, payload: Record<string, unknown>) => {
      return {
        ok: true,
        value: {
          statementId: String(payload['statementId'] ?? 's1'),
          sql: String(payload['sql'] ?? 'select 1 where a=?'),
          params: Array.isArray(payload['params']) ? payload['params'] : [1],
          mutating: Boolean(payload['mutating']),
        },
      };
    },
    verifyRequestSignature: async () => ({ ok: true }),
    createProxyServer: ({ backend }: any) => {
      capturedBackend = backend;
      return { start: vi.fn(async () => undefined) };
    },
  };
});

import { PostgresProxyServer } from '../../../../src/proxy/postgres/PostgresProxyServer';

describe('PostgresProxyServer', () => {
  beforeEach(() => {
    capturedBackend = undefined;
    poolQueryMock.mockReset();
    vi.clearAllMocks();
  });

  it('normalizes ? placeholders and returns 500 on statement errors', async () => {
    await PostgresProxyServer.start();

    poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const ok = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/statement',
      body: JSON.stringify({
        statementId: 's1',
        sql: 'select * from t where a=? and b=?',
        params: [1, 2],
      }),
    });
    expect(ok.status).toBe(200);
    expect(poolQueryMock.mock.calls[0]?.[0]).toContain('$1');

    poolQueryMock.mockRejectedValueOnce(new Error('boom'));
    const err = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/statement',
      body: JSON.stringify({ statementId: 's2', sql: 'select 1', params: [] }),
    });
    expect(err.status).toBe(500);
  });

  it('returns ok/meta changes for mutating statements', async () => {
    await PostgresProxyServer.start();

    poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 7 });
    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/statement',
      body: JSON.stringify({
        statementId: 's1',
        sql: 'update t set a=?',
        params: [1],
        mutating: true,
      }),
    });

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(out.body.meta.changes).toBe(7);
  });

  it('returns 400 on invalid SQL payload and 503 on health failure', async () => {
    await PostgresProxyServer.start();

    const invalid = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/query',
      body: JSON.stringify({ sql: 'invalid' }),
    });
    expect(invalid.status).toBe(400);

    poolQueryMock.mockRejectedValueOnce(new Error('unhealthy'));
    const health = await capturedBackend.health();
    expect(health.status).toBe(503);
  });

  it('returns 404 on unknown endpoint and 500 when query throws', async () => {
    await PostgresProxyServer.start();

    poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const unknown = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/unknown',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });
    expect(unknown.status).toBe(404);

    poolQueryMock.mockRejectedValueOnce(new Error('db down'));
    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/postgres/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });
    expect(out.status).toBe(500);
  });
});
