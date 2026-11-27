import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  env: {} as Record<string, any>,
  baseConfig: { host: '127.0.0.1', port: 8787, maxBodyBytes: 131072 } as any,
  signingConfig: {
    keyId: 'kid',
    secret: 'secret',
    requireSigning: false,
    signingWindowMs: 60000,
  } as any,
  statements: undefined as any,
  validateProxyRequestResult: null as any,
  parseJsonBodyResult: undefined as any,
  sqlValidation: undefined as any,
  statementResult: undefined as any,
  verifyResult: { ok: true } as any,
  query: vi.fn(),
  poolOptions: undefined as any,
  capturedBackend: null as any,
  capturedVerify: null as any,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  emitQuery: vi.fn(),
}));

vi.mock('@proxy/SqlProxyServerDeps', () => {
  const toProxyError = (status: number, code: string, message: string) => ({
    status,
    body: { code, message },
  });

  return {
    Env: {
      DB_HOST: '127.0.0.1',
      DB_PORT_POSTGRESQL: 5432,
      DB_DATABASE_POSTGRESQL: 'postgres',
      DB_USERNAME_POSTGRESQL: 'postgres',
      DB_PASSWORD_POSTGRESQL: '',
      POSTGRES_PROXY_POOL_LIMIT: 10,
    },
    Logger: H.logger,
    ErrorHandler: {
      toProxyError,
      toProxyServerError: vi.fn((status, code, _error, message) => ({
        status,
        body: { code, message },
      })),
    },
    resolveBaseConfig: (overrides: any) => ({
      ...H.baseConfig,
      ...(overrides?.host === undefined ? {} : { host: overrides.host }),
      ...(overrides?.port === undefined ? {} : { port: overrides.port }),
    }),
    resolveBaseSigningConfig: () => H.signingConfig,
    loadStatementRegistry: () => H.statements,
    validateProxyRequest: () => H.validateProxyRequestResult,
    parseJsonBody: (raw: string) => {
      if (H.parseJsonBodyResult !== undefined) return H.parseJsonBodyResult;
      try {
        return { value: JSON.parse(raw) };
      } catch {
        return toProxyError(400, 'BAD_JSON', 'Invalid JSON');
      }
    },
    validateSqlPayload: (payload: Record<string, unknown>) => {
      if (H.sqlValidation !== undefined) return H.sqlValidation;
      return {
        valid: true,
        sql: typeof payload['sql'] === 'string' ? payload['sql'] : 'SELECT 1',
        params: Array.isArray(payload['params']) ? payload['params'] : [],
      };
    },
    resolveStatementOrError: (_statements: any, payload: Record<string, unknown>) => {
      if (H.statementResult !== undefined) return H.statementResult;
      return {
        ok: true,
        value: {
          statementId: String(payload['statementId'] ?? 's1'),
          sql: typeof payload['sql'] === 'string' ? payload['sql'] : 'SELECT 1',
          params: Array.isArray(payload['params']) ? payload['params'] : [],
          mutating: Boolean(payload['mutating']),
        },
      };
    },
    verifyRequestSignature: vi.fn(async () => H.verifyResult),
    createProxyServer: vi.fn((input: any) => {
      H.capturedBackend = input.backend;
      H.capturedVerify = input.verify;
      return { start: vi.fn(async () => undefined) };
    }),
  };
});

vi.mock('pg', () => ({
  Pool: function Pool(options: any) {
    H.poolOptions = options;
    return { query: (...args: unknown[]) => H.query(...args) };
  },
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: { emitQuery: H.emitQuery },
}));

import { PostgresProxyServer } from '@proxy/postgres/PostgresProxyServer';

const post = (body: unknown, path = '/zin/postgres/query') => ({
  method: 'POST',
  path,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('PostgresProxyServer uncovered branches', () => {
  beforeEach(() => {
    H.baseConfig = { host: '127.0.0.1', port: 8787, maxBodyBytes: 131072 };
    H.signingConfig = {
      keyId: 'kid',
      secret: 'secret',
      requireSigning: false,
      signingWindowMs: 60000,
    };
    H.statements = undefined;
    H.validateProxyRequestResult = null;
    H.parseJsonBodyResult = undefined;
    H.sqlValidation = undefined;
    H.statementResult = undefined;
    H.verifyResult = { ok: true };
    H.query.mockReset();
    H.query.mockResolvedValue({ rows: [], rowCount: 0 });
    H.poolOptions = undefined;
    H.capturedBackend = null;
    H.capturedVerify = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the fallback pool size of 50 for a non-positive connection limit', async () => {
    await PostgresProxyServer.start();
    expect(H.poolOptions).toMatchObject({ max: 10 });

    await PostgresProxyServer.start({ connectionLimit: 0 });
    expect(H.poolOptions).toMatchObject({ max: 50 });
  });

  it('handles query, queryOne, exec and statement endpoints with row fallbacks', async () => {
    await PostgresProxyServer.start();

    H.query.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }))).body).toEqual({
      rows: [{ a: 1 }],
      rowCount: 1,
    });

    H.query.mockResolvedValueOnce({ rows: [{ a: 2 }], rowCount: 1 });
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/postgres/queryOne'))).body).toEqual(
      { row: { a: 2 } }
    );

    H.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/postgres/queryOne'))).body).toEqual(
      { row: null }
    );

    H.query.mockResolvedValueOnce({ rows: [], rowCount: 4 });
    expect((await H.capturedBackend.handle(post({ sql: 'UPDATE t' }, '/zin/postgres/exec'))).body).toEqual({
      ok: true,
      meta: { changes: 4 },
    });

    H.query.mockResolvedValueOnce({ rows: [{ a: 3 }], rowCount: 1 });
    expect(
      (await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/postgres/statement'))).body
    ).toEqual({ rows: [{ a: 3 }], rowCount: 1 });
  });

  it('normalizes missing rows and rowCount in statement and SQL results', async () => {
    await PostgresProxyServer.start();

    H.statementResult = {
      ok: true,
      value: { statementId: 's1', sql: 'SELECT 1', params: [], mutating: false },
    };
    H.query.mockResolvedValueOnce({ rows: undefined, rowCount: undefined });
    expect(
      (await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/postgres/statement'))).body
    ).toEqual({ rows: [], rowCount: 0 });

    H.query.mockResolvedValueOnce({ rows: [1, 2], rowCount: undefined });
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }))).body).toEqual({
      rows: [1, 2],
      rowCount: 2,
    });

    H.query.mockResolvedValueOnce({ rows: undefined, rowCount: undefined });
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }))).body).toEqual({
      rows: [],
      rowCount: 0,
    });
  });

  it('logs non-Error statement failures and returns validation fallbacks', async () => {
    await PostgresProxyServer.start();

    H.statementResult = {
      ok: false,
      response: { status: 404, body: { code: 'MISSING', message: 'missing' } },
    };
    expect(
      (await H.capturedBackend.handle(post({ statementId: 'x' }, '/zin/postgres/statement'))).status
    ).toBe(404);

    H.statementResult = {
      ok: true,
      value: { statementId: 's1', sql: 'SELECT 1', params: [], mutating: true },
    };
    H.query.mockRejectedValueOnce('string failure');
    expect(
      (await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/postgres/statement'))).status
    ).toBe(500);
    expect(H.logger.error).toHaveBeenCalled();

    H.sqlValidation = { valid: false };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);

    H.sqlValidation = { valid: true };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(200);

    H.sqlValidation = undefined;
    H.query.mockRejectedValueOnce('boom');
    expect((await H.capturedBackend.handle(post({}))).status).toBe(500);
  });

  it('normalizes ? placeholders and covers mutating statements and unknown endpoints', async () => {
    await PostgresProxyServer.start();

    H.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const normalized = await H.capturedBackend.handle(
      post({ sql: 'SELECT * FROM t WHERE a=? AND b=?', params: [1, 2] }, '/zin/postgres/unknown')
    );
    expect(normalized.status).toBe(404);
    expect(H.query.mock.calls[0]?.[0]).toBe('SELECT * FROM t WHERE a=$1 AND b=$2');

    H.statementResult = {
      ok: true,
      value: { statementId: 's1', sql: 'UPDATE t SET a=?', params: [1], mutating: true },
    };
    H.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    expect(
      (await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/postgres/statement'))).body
    ).toEqual({ ok: true, meta: { changes: 3 } });
    expect(H.query.mock.calls[1]?.[0]).toBe('UPDATE t SET a=$1');
  });

  it('returns pre-built validation responses and covers health/verify branches', async () => {
    await PostgresProxyServer.start();

    H.validateProxyRequestResult = { status: 405, body: { code: 'METHOD', message: 'no' } };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(405);
    H.validateProxyRequestResult = null;

    H.parseJsonBodyResult = { status: 400, body: { code: 'BAD_JSON', message: 'bad' } };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);
    H.parseJsonBodyResult = undefined;

    expect(await H.capturedBackend.health()).toEqual({
      status: 200,
      body: { status: 'healthy' },
    });
    H.query.mockRejectedValueOnce('unhealthy');
    expect((await H.capturedBackend.health()).status).toBe(503);

    H.verifyResult = { ok: false, error: { status: 403, message: 'bad signature' } };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({
      ok: false,
      status: 403,
      message: 'bad signature',
    });
    H.verifyResult = { ok: true };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({ ok: true });
  });
});
