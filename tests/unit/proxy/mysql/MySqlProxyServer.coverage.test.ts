import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedBackend: any;

const poolQueryMock = vi.fn();
vi.mock('mysql2/promise', () => ({
  createPool: () => ({
    query: (...args: unknown[]) => poolQueryMock(...args),
  }),
}));

vi.mock('@proxy/SqlProxyServerDeps', () => {
  const toProxyError = (status: number, code: string, message: string) => ({
    status,
    body: { code, message },
  });
  const Env = {
    MYSQL_PROXY_POOL_LIMIT: 10,
    get: (k: string, d?: string) => process.env[k] ?? d ?? '',
    getInt: (k: string, d: number) => {
      const raw = process.env[k];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : d;
    },
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
      if (payload['statementId'] === 'missing') {
        return { ok: false, response: toProxyError(404, 'MISSING', 'missing') };
      }
      return {
        ok: true,
        value: {
          statementId: String(payload['statementId'] ?? 's1'),
          sql: String(payload['sql'] ?? 'select 1'),
          params: Array.isArray(payload['params']) ? payload['params'] : [],
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

import { MySqlProxyServer } from '../../../../src/proxy/mysql/MySqlProxyServer';

describe('MySqlProxyServer', () => {
  beforeEach(() => {
    capturedBackend = undefined;
    poolQueryMock.mockReset();
    vi.clearAllMocks();
  });

  it('returns 400 on invalid SQL payload and 404 on unknown endpoint', async () => {
    await MySqlProxyServer.start();
    expect(capturedBackend).toBeDefined();

    const invalid = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/query',
      body: JSON.stringify({ sql: 'invalid' }),
    });
    expect(invalid.status).toBe(400);

    poolQueryMock.mockResolvedValueOnce([[]]);
    const unknown = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/unknown',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });
    expect(unknown.status).toBe(404);
  });

  it('returns 500 when query throws and 503 when health fails', async () => {
    await MySqlProxyServer.start();

    poolQueryMock.mockRejectedValueOnce(new Error('db down'));
    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });
    expect(out.status).toBe(500);

    poolQueryMock.mockRejectedValueOnce(new Error('unhealthy'));
    const health = await capturedBackend.health();
    expect(health.status).toBe(503);
  });

  it('returns 500 when statement execution throws', async () => {
    await MySqlProxyServer.start();

    poolQueryMock.mockRejectedValueOnce(new Error('boom'));
    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/mysql/statement',
      body: JSON.stringify({ statementId: 's1', sql: 'select 1', params: [], mutating: false }),
    });

    expect(out.status).toBe(500);
  });
});
