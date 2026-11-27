/* eslint-disable no-await-in-loop, no-nested-ternary -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyResult: { ok: true, payload: { sql: 'SELECT 1' } } as {
    ok: boolean;
    payload?: unknown;
    response?: Response;
  },
  emitQuery: vi.fn(),
  prepareError: undefined as unknown,
  allValue: undefined as unknown,
  firstValue: undefined as unknown,
  runValue: undefined as unknown,
}));

vi.mock('@proxy/CloudflareProxyShared', () => ({
  getEnvInt: (
    env: Record<string, unknown>,
    key: string,
    def: number
  ): number => {
    const value = env[key];
    const parsed =
      typeof value === 'string'
        ? Number.parseInt(value, 10)
        : typeof value === 'number'
          ? value
          : Number.NaN;
    return Number.isFinite(parsed) ? parsed : def;
  },
  json: (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  normalizeBindingName: (name: unknown) => (typeof name === 'string' ? name : ''),
  readAndVerifyJson: vi.fn(async () => mocks.verifyResult),
  toErrorResponse: (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: code, message }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@proxy/RequestValidator', () => ({
  RequestValidator: {
    requirePost: (method: string) =>
      method === 'POST' ? null : { code: 'METHOD_NOT_ALLOWED' },
  },
}));

vi.mock('@/trace/SystemTraceWorkerBridge', () => ({
  SystemTraceWorkerBridge: {
    emitQuery: mocks.emitQuery,
  },
}));

import { normalizeParams } from '@/proxy/d1/ZintrustD1Proxy';
import ZintrustD1Proxy from '@/proxy/d1/ZintrustD1Proxy';


const makeDb = () => {
  const statement = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockImplementation(async () =>
      mocks.allValue === undefined ? { results: [{ id: 1 }] } : mocks.allValue
    ),
    first: vi.fn().mockImplementation(async () =>
      mocks.firstValue === undefined ? { id: 1 } : mocks.firstValue
    ),
    run: vi.fn().mockImplementation(async () =>
      mocks.runValue === undefined ? { meta: {} } : mocks.runValue
    ),
  };
  return {
    statement,
    prepare: vi.fn().mockImplementation(() => {
      if (mocks.prepareError !== undefined) throw mocks.prepareError;
      return statement;
    }),
  };
};

const makeEnv = (overrides: Record<string, unknown> = {}) => ({
  DB: makeDb(),
  D1_BINDING: 'DB',
  APP_KEY: 'test-key',
  D1_REMOTE_SECRET: 'secret',
  ZT_D1_STATEMENTS_JSON: '{}',
  ...overrides,
});

const request = (path: string, body: unknown = {}) =>
  new Request(`https://example.com${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('ZintrustD1Proxy uncovered branches', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyResult = { ok: true, payload: { sql: 'SELECT 1' } };
    mocks.prepareError = undefined;
    mocks.allValue = undefined;
    mocks.firstValue = undefined;
    mocks.runValue = undefined;
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('normalizeParams handles non-arrays and every value shape', () => {
    expect(normalizeParams('not-an-array' as never)).toBe('not-an-array');

    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    const date = new Date('2024-01-02T03:04:05.000Z');
    expect(
      normalizeParams([7, 1.5, date, { a: 1 }, buffer, view, null, 'text', true])
    ).toEqual(['7', 1.5, '2024-01-02T03:04:05.000Z', '{"a":1}', buffer, view, null, 'text', true]);
  });

  it('only enables debug logging for true-like string values', async () => {
    const cases: Array<[unknown, boolean]> = [
      [1, false],
      ['TRUE', true],
      ['1', true],
      ['yes', true],
      ['false', false],
      ['random', false],
    ];

    for (const [debug, expected] of cases) {
      consoleError.mockClear();
      mocks.prepareError = new Error('boom');
      const env = makeEnv({ ZT_PROXY_DEBUG: debug });
      const response = await ZintrustD1Proxy.fetch(request('/zin/d1/query'), env);
      expect(response.status).toBe(500);
      expect(consoleError.mock.calls.length > 0).toBe(expected);
    }
  });

  it('formats Error, string, object and circular error messages', async () => {
    const errors: Array<[unknown, string]> = [
      [new Error('error message'), 'error message'],
      ['string message', 'string message'],
      [{ detail: 'x' }, '{"detail":"x"}'],
    ];
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    errors.push([circular, 'Unknown D1 error']);

    for (const [error, expected] of errors) {
      mocks.prepareError = error;
      const response = await ZintrustD1Proxy.fetch(
        request('/zin/d1/query'),
        makeEnv({ ZT_PROXY_DEBUG: 'true' })
      );
      expect(await response.json()).toMatchObject({ message: expected });
    }
  });

  it('rejects statement requests with missing, empty, non-string or non-object statements', async () => {
    mocks.verifyResult = { ok: true, payload: { statementId: 's1' } };
    for (const value of [undefined, '', '   ', 42, 'null', '"str"', '{broken']) {
      const env = makeEnv();
      if (value === undefined) delete (env as Record<string, unknown>)['ZT_D1_STATEMENTS_JSON'];
      else (env as Record<string, unknown>)['ZT_D1_STATEMENTS_JSON'] = value;
      const response = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
      expect(response.status, `statements=${String(value)}`).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'CONFIG_ERROR' });
    }

    // isRecord() also accepts arrays, so a JSON array is treated as a (empty) statement map.
    const arrayEnv = makeEnv({ ZT_D1_STATEMENTS_JSON: '["array"]' });
    expect((await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), arrayEnv)).status).toBe(404);
  });

  it('reads routing metadata from query results', async () => {
    const metaCases: Array<[unknown, unknown]> = [
      [{ served_by_primary: true, served_by_region: 'us' }, { servedByPrimary: true, servedByRegion: 'us' }],
      [{ served_by_primary: 'yes', served_by_region: '  ' }, undefined],
      [{ served_by_region: 'eu' }, { servedByRegion: 'eu' }],
      [{}, undefined],
      [null, undefined],
    ];

    for (const [meta, expected] of metaCases) {
      mocks.emitQuery.mockClear();
      mocks.allValue = { results: [], meta };
      const response = await ZintrustD1Proxy.fetch(
        request('/zin/d1/query'),
        makeEnv()
      );
      expect(response.status).toBe(200);
      expect(mocks.emitQuery).toHaveBeenCalledWith(
        'SELECT 1',
        [],
        expect.any(Number),
        'd1-proxy',
        expected
      );
    }
  });

  it('returns an empty row set when a query result has no results property', async () => {
    mocks.allValue = {};
    const response = await ZintrustD1Proxy.fetch(request('/zin/d1/query'), makeEnv());
    expect(await response.json()).toEqual({ rows: [], rowCount: 0 });
  });

  it('normalizes a null first() result to row null', async () => {
    mocks.firstValue = null;
    const response = await ZintrustD1Proxy.fetch(request('/zin/d1/queryOne'), makeEnv());
    expect(await response.json()).toEqual({ row: null });

    mocks.firstValue = { id: 9 };
    const second = await ZintrustD1Proxy.fetch(request('/zin/d1/queryOne'), makeEnv());
    expect(await second.json()).toEqual({ row: { id: 9 } });
  });

  it('uses all() for RETURNING exec and run() otherwise', async () => {
    const db = makeDb();
    const env = makeEnv({ DB: db });

    mocks.verifyResult = { ok: true, payload: { sql: 'INSERT INTO t VALUES (1) RETURNING id', params: [] } };
    mocks.allValue = { results: [{ id: 1 }], meta: { changed: true } };
    const withReturning = await ZintrustD1Proxy.fetch(request('/zin/d1/exec'), env);
    expect(db.statement.all).toHaveBeenCalled();
    expect(await withReturning.json()).toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
      meta: { changed: true },
    });

    mocks.allValue = {};
    const withoutResults = await ZintrustD1Proxy.fetch(request('/zin/d1/exec'), env);
    expect(await withoutResults.json()).toEqual({ rows: [], rowCount: 0, meta: undefined });

    mocks.verifyResult = { ok: true, payload: { sql: 'UPDATE t SET a = 1', params: [] } };
    mocks.runValue = { meta: { changes: 1 } };
    const withoutReturning = await ZintrustD1Proxy.fetch(request('/zin/d1/exec'), env);
    expect(db.statement.run).toHaveBeenCalled();
    expect(await withoutReturning.json()).toEqual({ ok: true, meta: { changes: 1 } });
  });

  it('validates sql payload shapes before reaching the database', async () => {
    mocks.verifyResult = { ok: true, payload: 'not-an-object' };
    expect((await ZintrustD1Proxy.fetch(request('/zin/d1/query'), makeEnv())).status).toBe(400);

    mocks.verifyResult = { ok: true, payload: { sql: 42 } };
    expect((await ZintrustD1Proxy.fetch(request('/zin/d1/query'), makeEnv())).status).toBe(400);

    mocks.verifyResult = { ok: true, payload: { sql: 'SELECT 1', params: 'not-an-array' } };
    expect((await ZintrustD1Proxy.fetch(request('/zin/d1/query'), makeEnv())).status).toBe(200);
  });

  it('fails early when signature verification or the database is unavailable', async () => {
    mocks.verifyResult = { ok: false, response: new Response('unauthorized', { status: 401 }) };
    const unauthorized = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), makeEnv());
    expect(unauthorized.status).toBe(401);

    mocks.verifyResult = { ok: true, payload: { statementId: 's1' } };
    const noDb = makeEnv({ DB: undefined, zintrust_db: undefined, D1_BINDING: '' });
    const missingDb = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), noDb);
    expect(missingDb.status).toBe(400);
    expect(await missingDb.json()).toMatchObject({
      message: 'Missing D1 binding (DB) or binding name via D1_BINDING',
    });
  });

  it('validates statement ids and falls back when params is not an array', async () => {
    const env = makeEnv({
      ZT_D1_STATEMENTS_JSON: JSON.stringify({ s1: 'SELECT 1' }),
    });

    for (const payload of ['not-an-object', { statementId: 42 }, { statementId: '   ' }]) {
      mocks.verifyResult = { ok: true, payload };
      const response = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    }

    mocks.verifyResult = { ok: true, payload: { statementId: 's1', params: 'not-an-array' } };
    expect((await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env)).status).toBe(200);

    mocks.verifyResult = { ok: true, payload: { statementId: 'unknown' } };
    const missing = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
    expect(missing.status).toBe(404);
  });

  it('handles statement execution through all/run with and without results', async () => {
    const db = makeDb();
    const env = makeEnv({
      DB: db,
      ZT_D1_STATEMENTS_JSON: JSON.stringify({
        read: 'SELECT 1',
        write: 'INSERT INTO t VALUES (1)',
        modified: 'INSERT INTO t VALUES (1) RETURNING id',
      }),
    });

    mocks.verifyResult = { ok: true, payload: { statementId: 'modified' } };
    mocks.allValue = {};
    const noResults = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
    expect(await noResults.json()).toEqual({ rows: [], rowCount: 0, meta: undefined });

    mocks.verifyResult = { ok: true, payload: { statementId: 'read' } };
    mocks.allValue = { results: [{ id: 2 }], meta: { served: true } };
    const read = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
    expect(db.statement.all).toHaveBeenCalled();
    expect(await read.json()).toEqual({
      rows: [{ id: 2 }],
      rowCount: 1,
      meta: { served: true },
    });

    mocks.verifyResult = { ok: true, payload: { statementId: 'write' } };
    const write = await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env);
    expect(db.statement.run).toHaveBeenCalled();
    expect(await write.json()).toEqual({ ok: true, meta: {} });
  });

  it('short-circuits queryOne and exec on verification failures, accepts array params and rejects GET', async () => {
    mocks.verifyResult = { ok: false, response: new Response('unauthorized', { status: 401 }) };
    expect(
      (await ZintrustD1Proxy.fetch(request('/zin/d1/queryOne'), makeEnv())).status
    ).toBe(401);
    expect(
      (await ZintrustD1Proxy.fetch(request('/zin/d1/exec'), makeEnv())).status
    ).toBe(401);

    mocks.verifyResult = { ok: true, payload: { statementId: 's1', params: [] } };
    const env = makeEnv({ ZT_D1_STATEMENTS_JSON: '{"s1":"SELECT 1"}' });
    expect(
      (await ZintrustD1Proxy.fetch(request('/zin/d1/statement'), env)).status
    ).toBe(200);

    const getRequest = new Request('https://example.com/zin/d1/query', { method: 'GET' });
    const rejected = await ZintrustD1Proxy.fetch(getRequest, makeEnv());
    expect(rejected.status).toBe(405);
  });
});
