/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  env: {} as Record<string, any>,
  baseConfig: { host: '127.0.0.1', port: 8786, maxBodyBytes: 131072 } as any,
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
  createPoolOptions: undefined as any,
  capturedBackend: null as any,
  capturedVerify: null as any,
  capturedInput: null as any,
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
      MYSQL_PROXY_POOL_LIMIT: 10,
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
      ...(overrides?.maxBodyBytes === undefined ? {} : { maxBodyBytes: overrides.maxBodyBytes }),
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
          sql: String(payload['sql'] ?? 'SELECT 1'),
          params: Array.isArray(payload['params']) ? payload['params'] : [],
          mutating: Boolean(payload['mutating']),
        },
      };
    },
    verifyRequestSignature: vi.fn(async () => H.verifyResult),
    createProxyServer: vi.fn((input: any) => {
      H.capturedInput = input;
      H.capturedBackend = input.backend;
      H.capturedVerify = input.verify;
      return { start: vi.fn(async () => undefined) };
    }),
  };
});

vi.mock('mysql2/promise', () => ({
  createPool: vi.fn((options: any) => {
    H.createPoolOptions = options;
    return { query: (...args: unknown[]) => H.query(...args) };
  }),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: { emitQuery: H.emitQuery },
}));

import { MySqlProxyServer } from '@proxy/mysql/MySqlProxyServer';

const post = (body: unknown, path = '/zin/mysql/query') => ({
  method: 'POST',
  path,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('MySqlProxyServer uncovered branches', () => {
  beforeEach(() => {
    H.env = {};
    H.baseConfig = { host: '127.0.0.1', port: 8786, maxBodyBytes: 131072 };
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
    H.query.mockResolvedValue([[]]);
    H.createPoolOptions = undefined;
    H.capturedBackend = null;
    H.capturedVerify = null;
    H.capturedInput = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves database config from env, explicit overrides and non-positive limits', async () => {
    H.env = {
      MYSQL_DB_HOST: 'env-host',
      DB_HOST: 'fallback-host',
      MYSQL_DB_PORT: 1234,
      DB_PORT: 3306,
      MYSQL_DB_DATABASE: 'env-db',
      DB_DATABASE: 'fallback-db',
      MYSQL_DB_USERNAME: 'env-user',
      DB_USERNAME: 'root',
      MYSQL_DB_PASSWORD: 'env-pass',
      DB_PASSWORD: 'pass',
    };

    await MySqlProxyServer.start();
    expect(H.createPoolOptions).toMatchObject({
      host: 'env-host',
      port: 1234,
      database: 'env-db',
      user: 'env-user',
      password: 'env-pass',
      connectionLimit: 10,
    });

    await MySqlProxyServer.start({
      dbHost: 'override-host',
      dbPort: 4321,
      dbName: 'override-db',
      dbUser: 'override-user',
      dbPass: 'override-pass',
      connectionLimit: 0,
    });
    expect(H.createPoolOptions).toMatchObject({
      host: 'override-host',
      port: 4321,
      database: 'override-db',
      user: 'override-user',
      password: 'override-pass',
      connectionLimit: 50,
    });
  });

  it('throws a signing config error when credentials are incomplete', async () => {
    H.signingConfig = { ...H.signingConfig, requireSigning: true, secret: '' };
    await expect(MySqlProxyServer.start()).rejects.toThrow(/signing is required/);

    H.signingConfig = { ...H.signingConfig, keyId: '' };
    await expect(MySqlProxyServer.start()).rejects.toThrow(/keyId=<empty>/);

    const originalCwd = process.cwd;
    try {
      (process as any).cwd = undefined;
      await expect(MySqlProxyServer.start()).rejects.toThrow(/cwd=<unknown>/);
    } finally {
      (process as any).cwd = originalCwd;
    }
  });

  it('normalizes array, object, null and typed insert-id query rows', async () => {
    await MySqlProxyServer.start();

    H.query.mockResolvedValueOnce([[{ a: 1 }]]);
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }))).body).toEqual({
      rows: [{ a: 1 }],
      rowCount: 1,
    });

    H.query.mockResolvedValueOnce([{ affectedRows: 7, insertId: 99 }]);
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/mysql/exec'))).body).toEqual({
      ok: true,
      meta: { changes: 7, lastRowId: 99 },
    });

    for (const insertId of ['insert-string', 10n, null]) {
      H.query.mockResolvedValueOnce([{ affectedRows: 'not-a-number', insertId }]);
      const result = await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/mysql/exec'));
      expect(result.body.ok).toBe(true);
      expect(result.body.meta.changes).toBe(0);
      expect(result.body.meta.lastRowId).toBe(
        insertId === 'insert-string' || typeof insertId === 'bigint' ? insertId : undefined
      );
    }

    H.query.mockResolvedValueOnce([null]);
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }))).body).toEqual({
      rows: [],
      rowCount: 0,
    });
  });

  it('handles queryOne with rows and without rows', async () => {
    await MySqlProxyServer.start();

    H.query.mockResolvedValueOnce([[{ a: 1 }]]);
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/mysql/queryOne'))).body).toEqual(
      { row: { a: 1 } }
    );

    H.query.mockResolvedValueOnce([null]);
    expect((await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/mysql/queryOne'))).body).toEqual(
      { row: null }
    );
  });

  it('covers statement resolution errors and non-Error logging', async () => {
    await MySqlProxyServer.start();

    H.statementResult = { ok: false, response: { status: 404, body: { code: 'MISSING', message: 'no' } } };
    expect(
      (await H.capturedBackend.handle(post({ statementId: 'x' }, '/zin/mysql/statement'))).status
    ).toBe(404);

    H.statementResult = {
      ok: true,
      value: {
        statementId: 's1',
        sql: 'SELECT 1',
        params: [],
        mutating: true,
      },
    };
    H.query.mockRejectedValueOnce('string failure');
    const failed = await H.capturedBackend.handle(
      post({ statementId: 's1' }, '/zin/mysql/statement')
    );
    expect(failed.status).toBe(500);
    expect(H.logger.error).toHaveBeenCalled();
  });

  it('covers SQL validation fallbacks and non-Error query failures', async () => {
    await MySqlProxyServer.start();

    H.sqlValidation = { valid: false };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);

    H.sqlValidation = { valid: true };
    H.query.mockResolvedValueOnce([[]]);
    expect((await H.capturedBackend.handle(post({}))).status).toBe(200);

    H.sqlValidation = { valid: true, sql: 'SELECT 1', params: 'not-an-array' };
    H.query.mockRejectedValueOnce('boom');
    expect((await H.capturedBackend.handle(post({}))).status).toBe(500);
  });

  it('executes statements successfully and covers health/unknown-endpoint paths', async () => {
    await MySqlProxyServer.start();

    H.query.mockResolvedValueOnce([[]]);
    expect(
      (await H.capturedBackend.handle(post({ sql: 'SELECT 1' }, '/zin/mysql/unknown'))).status
    ).toBe(404);

    H.statementResult = {
      ok: true,
      value: { statementId: 's1', sql: 'SELECT 1', params: [], mutating: false },
    };
    const read = await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/mysql/statement'));
    expect(read.body).toEqual({ rows: [], rowCount: 0 });

    H.query.mockResolvedValueOnce([[]]);
    H.statementResult.value.mutating = true;
    const write = await H.capturedBackend.handle(post({ statementId: 's1' }, '/zin/mysql/statement'));
    expect(write.body.ok).toBe(true);

    H.query.mockResolvedValueOnce([[]]);
    expect(await H.capturedBackend.health()).toEqual({
      status: 200,
      body: { status: 'healthy' },
    });
  });

  it('returns pre-built validation responses and maps health/verify errors', async () => {
    await MySqlProxyServer.start();

    H.validateProxyRequestResult = { status: 405, body: { code: 'METHOD', message: 'no' } };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(405);
    H.validateProxyRequestResult = null;

    H.parseJsonBodyResult = { status: 400, body: { code: 'BAD_JSON', message: 'bad' } };
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);
    H.parseJsonBodyResult = undefined;

    H.query.mockRejectedValueOnce('unhealthy');
    expect((await H.capturedBackend.health()).status).toBe(503);

    H.verifyResult = { ok: false, error: { status: 401, message: 'bad signature' } };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({
      ok: false,
      status: 401,
      message: 'bad signature',
    });
    H.verifyResult = { ok: true };
    expect(await H.capturedVerify({ headers: {} } as any, '{}')).toEqual({ ok: true });
  });
});
