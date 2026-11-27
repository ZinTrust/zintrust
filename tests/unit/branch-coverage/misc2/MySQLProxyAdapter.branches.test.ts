import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  requestProxy: vi.fn(),
  resolveMode: vi.fn(() => 'sql' as 'sql' | 'registry'),
  ensureSignedSettings: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  withTraceSkipContext: vi.fn((ctx: unknown) => ctx),
  notReachable: vi.fn((_label: string, baseUrl: string, error: unknown) => {
    return new Error(`not reachable at ${baseUrl}: ${String(error)}`);
  }),
  settings: vi.fn(() => ({
    baseUrl: 'http://mysql-proxy.example',
    keyId: '',
    secret: '',
    timeoutMs: 1000,
  })),
  execMeta: vi.fn(() => ({ changes: 0, lastRowId: undefined })),
  createStatementPayload: vi.fn(async () => ({ statementId: 'stmt-1' })),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: (...args: unknown[]) => m.loggerError(...args),
    info: (...args: unknown[]) => m.loggerInfo(...args),
    withTraceSkipContext: (ctx: unknown) => m.withTraceSkipContext(ctx),
  },
}));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value),
  ensureSignedSettings: (...args: unknown[]) => m.ensureSignedSettings(...args),
}));

vi.mock('@orm/adapters/SqlProxyHttpAdapterShared', () => ({
  SqlProxyHttpAdapterShared: {
    buildProxySettingsFromEnv: () => m.settings(),
    buildStandardSignedProxyConfig: (input: { settings: unknown }) => input.settings,
    requestProxy: (...args: unknown[]) => m.requestProxy(...args),
    resolveProxyModeFromEnv: () => m.resolveMode(),
    createProxyNotReachableCliError: (...args: unknown[]) => (m.notReachable as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@orm/adapters/SqlProxyRegistryMode', () => ({
  createStatementPayload: (...args: unknown[]) => (m.createStatementPayload as (...a: any[]) => any)(...args),
  getExecMetaWithLastRowId: (...args: unknown[]) => (m.execMeta as (...a: any[]) => any)(...args),
}));

import { MySQLProxyAdapter } from '@/orm/adapters/MySQLProxyAdapter';

const makeAdapter = async (mode: 'sql' | 'registry' = 'sql') => {
  m.resolveMode.mockReturnValue(mode);
  const adapter = MySQLProxyAdapter.create({} as never);
  await adapter.connect();
  return adapter;
};

const loggedContext = () => m.loggerError.mock.calls.at(-1)?.[1] as Record<string, unknown>;

describe('MySQLProxyAdapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveMode.mockReturnValue('sql');
    m.settings.mockReturnValue({
      baseUrl: 'http://mysql-proxy.example',
      keyId: '',
      secret: '',
      timeoutMs: 1000,
    });
    m.execMeta.mockReturnValue({ changes: 0, lastRowId: undefined });
    m.createStatementPayload.mockResolvedValue({ statementId: 'stmt-1' });
  });

  it('logs empty vs configured signing credentials at creation time', async () => {
    MySQLProxyAdapter.create({} as never);
    expect(m.loggerInfo.mock.calls[0]?.[1]).toMatchObject({
      hasKeyId: false,
      hasSecret: false,
    });

    m.settings.mockReturnValue({
      baseUrl: 'http://mysql-proxy.example',
      keyId: 'kid',
      secret: 'sec',
      timeoutMs: 1000,
    });
    MySQLProxyAdapter.create({} as never);
    expect(m.loggerInfo.mock.calls[1]?.[1]).toMatchObject({
      hasKeyId: true,
      hasSecret: true,
    });

    m.settings.mockReturnValue({
      baseUrl: 'http://mysql-proxy.example',
      keyId: undefined,
      secret: undefined,
      timeoutMs: undefined,
    });
    MySQLProxyAdapter.create({} as never);
    expect(m.loggerInfo.mock.calls[2]?.[1]).toMatchObject({
      hasKeyId: false,
      hasSecret: false,
    });
  });

  it('converts query and queryOne responses into query results', async () => {
    const adapter = await makeAdapter();

    m.requestProxy.mockResolvedValueOnce({
      rows: [{ id: 7 }],
      rowCount: 1,
      lastInsertId: BigInt(7),
    });
    await expect(adapter.query('select 1', [])).resolves.toEqual({
      rows: [{ id: 7 }],
      rowCount: 1,
      lastInsertId: BigInt(7),
    });

    m.requestProxy.mockResolvedValueOnce({ row: { id: 'a' } });
    await expect(adapter.query('select 1', [])).resolves.toEqual({
      rows: [{ id: 'a' }],
      rowCount: 1,
    });

    m.requestProxy.mockResolvedValueOnce({ row: null });
    await expect(adapter.query('select 1', [])).resolves.toEqual({ rows: [], rowCount: 0 });

    m.execMeta.mockReturnValueOnce({ changes: 3, lastRowId: 'last' });
    m.requestProxy.mockResolvedValueOnce({ ok: true });
    await expect(adapter.query('update t', [])).resolves.toEqual({
      rows: [],
      rowCount: 3,
      lastInsertId: 'last',
    });
  });

  it('handles registry queryOne response shapes and null rows', async () => {
    const adapter = await makeAdapter('registry');

    m.requestProxy.mockResolvedValueOnce({ row: null });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    m.requestProxy.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });
    await expect(adapter.queryOne('select 1', [])).resolves.toEqual({ a: 1 });

    m.requestProxy.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    m.requestProxy.mockResolvedValueOnce({ ok: true });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    expect(m.createStatementPayload).toHaveBeenCalled();
  });

  it('returns null for an absent row in sql mode', async () => {
    const adapter = await makeAdapter('sql');
    m.requestProxy.mockResolvedValueOnce({});
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();
    expect(m.requestProxy.mock.calls[0]?.[1]).toBe('/zin/mysql/queryOne');
  });

  it('describes string, record and nested error details when proxy calls fail', async () => {
    const adapter = await makeAdapter();

    m.requestProxy.mockRejectedValueOnce('plain failure');
    await expect(adapter.query('select 1', [])).rejects.toBe('plain failure');
    expect(loggedContext()['error']).toBe('plain failure');

    const withStringDetails = Object.assign(new Error('outer'), { details: '  detail text  ' });
    m.requestProxy.mockRejectedValueOnce(withStringDetails);
    await expect(adapter.query('select 1', [])).rejects.toBe(withStringDetails);
    expect(loggedContext()['error']).toBe('outer (detail text)');

    const withNestedDetails = Object.assign(new Error('outer'), {
      details: { body: { code: '  E1  ', message: '  bad request  ' } },
    });
    m.requestProxy.mockRejectedValueOnce(withNestedDetails);
    await expect(adapter.query('select 1', [])).rejects.toBe(withNestedDetails);
    expect(loggedContext()['error']).toBe('outer (E1: bad request)');

    const withCodeOnly = Object.assign(new Error('outer'), {
      details: { body: { code: 'E2', message: '   ' } },
    });
    m.requestProxy.mockRejectedValueOnce(withCodeOnly);
    await expect(adapter.query('select 1', [])).rejects.toBe(withCodeOnly);
    expect(loggedContext()['error']).toBe('outer (E2)');

    const withMessageOnly = Object.assign(new Error('outer'), {
      details: { body: { code: ' ', message: 'M1' } },
    });
    m.requestProxy.mockRejectedValueOnce(withMessageOnly);
    await expect(adapter.query('select 1', [])).rejects.toBe(withMessageOnly);
    expect(loggedContext()['error']).toBe('outer (M1)');

    const withDetailFields = Object.assign(new Error('outer'), {
      details: { message: '  inner message  ' },
    });
    m.requestProxy.mockRejectedValueOnce(withDetailFields);
    await expect(adapter.query('select 1', [])).rejects.toBe(withDetailFields);
    expect(loggedContext()['error']).toBe('outer (inner message)');

    const withDetailCode = Object.assign(new Error('outer'), { details: { code: '  C3  ' } });
    m.requestProxy.mockRejectedValueOnce(withDetailCode);
    await expect(adapter.query('select 1', [])).rejects.toBe(withDetailCode);
    expect(loggedContext()['error']).toBe('outer (C3)');

    const alreadyIncluded = Object.assign(new Error('outer (dup)'), { details: 'dup' });
    m.requestProxy.mockRejectedValueOnce(alreadyIncluded);
    await expect(adapter.query('select 1', [])).rejects.toBe(alreadyIncluded);
    expect(loggedContext()['error']).toBe('outer (dup)');
  });

  it('logs error code/status/details only when they are present', async () => {
    const adapter = await makeAdapter();
    const error = Object.assign(new Error('boom'), {
      code: ' E5 ',
      statusCode: 503,
      details: { message: 'inner' },
    });
    m.requestProxy.mockRejectedValueOnce(error);
    await expect(adapter.query('select 1', [])).rejects.toBe(error);

    expect(loggedContext()).toMatchObject({
      error: 'boom (inner)',
      errorCode: ' E5 ',
      errorStatusCode: 503,
      errorDetails: { message: 'inner' },
    });

    const missingFieldsError = Object.assign(new Error('boom'), {
      code: '   ',
      statusCode: '503',
    });
    m.requestProxy.mockRejectedValueOnce(missingFieldsError);
    await expect(adapter.query('select 1', [])).rejects.toBe(missingFieldsError);
    expect(loggedContext()).not.toHaveProperty('errorCode');
    expect(loggedContext()).not.toHaveProperty('errorStatusCode');
  });

  it('requires a connection and wraps transaction and proxy setup failures', async () => {
    const adapter = MySQLProxyAdapter.create({} as never);
    await expect(adapter.query('select 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.queryOne('select 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.ping()).rejects.toThrow(/not connected/i);
    await expect(adapter.rawQuery('select 1')).rejects.toThrow(/not connected/i);
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/not connected/i);
    await expect(adapter.ensureMigrationsTable!()).rejects.toThrow(/not connected/i);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getType()).toBe('mysql');
    expect(adapter.getPlaceholder(1)).toBe('?');
    expect(m.ensureSignedSettings).toHaveBeenCalled();

    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow(/transaction failed/i);
    await expect(adapter.transaction(async () => 5)).resolves.toBe(5);

    m.requestProxy.mockRejectedValueOnce(new Error('offline'));
    await expect(adapter.ensureMigrationsTable!()).rejects.toThrow(/not reachable/i);
    expect(m.notReachable).toHaveBeenCalledWith(
      'MySQL proxy',
      'http://mysql-proxy.example',
      expect.any(Error)
    );

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('uses the statement endpoint and defaults rawQuery parameters', async () => {
    const adapter = await makeAdapter('registry');
    m.requestProxy.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });

    await adapter.query('select 1', ['x']);
    expect(m.requestProxy.mock.calls[0]?.[1]).toBe('/zin/mysql/statement');

    m.requestProxy.mockResolvedValueOnce({ rows: [{ b: 2 }], rowCount: 1 });
    await expect(adapter.rawQuery('select 2')).resolves.toEqual([{ b: 2 }]);
    expect(m.createStatementPayload).toHaveBeenLastCalledWith('select 2', []);
  });
});
