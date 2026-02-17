import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedBackend: any;

const queryMock = vi.fn();
const inputMock = vi.fn();
const closeMock = vi.fn(async () => undefined);

vi.mock('mssql', () => ({
  connect: async () => ({
    request: () => ({
      input: (name: string, value: unknown) => inputMock(name, value),
      query: (sql: string) => queryMock(sql),
    }),
    close: () => closeMock(),
  }),
}));

vi.mock('@proxy/SqlProxyServerDeps', () => {
  const toProxyError = (status: number, code: string, message: string) => ({
    status,
    body: { code, message },
  });
  const Env = {
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
      const sql = typeof payload['sql'] === 'string' ? payload['sql'] : '';
      const params = Array.isArray(payload['params']) ? payload['params'] : [];
      return { valid: true, sql, params };
    },
    resolveStatementOrError: (_statements: any, payload: Record<string, unknown>) => {
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

import * as Deps from '@proxy/SqlProxyServerDeps';
import { SqlServerProxyServer } from '../../../../src/proxy/sqlserver/SqlServerProxyServer';

describe('SqlServerProxyServer', () => {
  beforeEach(() => {
    capturedBackend = undefined;
    queryMock.mockReset();
    inputMock.mockReset();
    vi.clearAllMocks();
  });

  it('returns validation error when sql is required (empty string)', async () => {
    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: '', params: [] }),
    });

    expect(out.status).toBe(400);
  });

  it('handles queryOne endpoint and statement mutating response', async () => {
    queryMock.mockResolvedValueOnce({ recordset: [{ a: 1 }], rowsAffected: [1] });

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/queryOne',
      body: JSON.stringify({ sql: 'select 1', params: [10, 20] }),
    });

    expect(out.status).toBe(200);
    expect(out.body.row).toEqual({ a: 1 });
    expect(inputMock).toHaveBeenCalledWith('param0', 10);
    expect(inputMock).toHaveBeenCalledWith('param1', 20);

    queryMock.mockResolvedValueOnce({ recordset: [], rowsAffected: [5] });
    const stmt = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/statement',
      body: JSON.stringify({ statementId: 's1', sql: 'update t', params: [], mutating: true }),
    });

    expect(stmt.status).toBe(200);
    expect(stmt.body.ok).toBe(true);
    expect(stmt.body.meta.changes).toBe(5);
  });

  it('returns rows/rowCount for non-mutating statement requests', async () => {
    queryMock.mockResolvedValueOnce({ recordset: [{ a: 1 }], rowsAffected: [1] });

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/statement',
      body: JSON.stringify({ statementId: 's1', sql: 'select 1', params: [], mutating: false }),
    });

    expect(out.status).toBe(200);
    expect(out.body.rows).toEqual([{ a: 1 }]);
    expect(out.body.rowCount).toBe(1);
  });

  it('handles query endpoint and returns rowCount=0 when rowsAffected is empty', async () => {
    queryMock.mockResolvedValueOnce({ recordset: [{ a: 1 }], rowsAffected: [] });

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });

    expect(out.status).toBe(200);
    expect(out.body.rows).toEqual([{ a: 1 }]);
    expect(out.body.rowCount).toBe(0);
  });

  it('handles query endpoint and returns rowCount from rowsAffected[0]', async () => {
    queryMock.mockResolvedValueOnce({ recordset: [], rowsAffected: [3] });

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });

    expect(out.status).toBe(200);
    expect(out.body.rowCount).toBe(3);
  });

  it('returns 500 and logs when statement execution fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/statement',
      body: JSON.stringify({ statementId: 's1', sql: 'select 1', params: [], mutating: false }),
    });

    expect(out.status).toBe(500);
    expect(out.body.code).toBe('SQLSERVER_ERROR');
    expect(Deps.Logger.error).toHaveBeenCalled();
  });

  it('returns 500 when sql query endpoint throws', async () => {
    queryMock.mockRejectedValueOnce('nope');

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/queryOne',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });

    expect(out.status).toBe(500);
    expect(out.body.code).toBe('SQLSERVER_ERROR');
  });

  it('returns unhealthy response when health check fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('unhealthy'));

    await SqlServerProxyServer.start();

    const out = await capturedBackend.health();
    expect(out.status).toBe(503);
    expect(out.body.code).toBe('UNHEALTHY');
  });

  it('returns 404 for unknown endpoint and shuts down pool', async () => {
    queryMock.mockResolvedValueOnce({ recordset: [], rowsAffected: [0] });

    await SqlServerProxyServer.start();

    const out = await capturedBackend.handle({
      method: 'POST',
      path: '/zin/sqlserver/unknown',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });

    expect(out.status).toBe(404);
    await capturedBackend.shutdown();
    expect(closeMock).toHaveBeenCalled();
  });
});
