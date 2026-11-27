/* eslint-disable @typescript-eslint/no-explicit-any, no-await-in-loop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  adapter: {} as any,
  factory: vi.fn((_config?: unknown) => state.adapter),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  auroraError: undefined as unknown,
  auroraResponse: {} as Record<string, unknown>,
  executeCalls: [] as unknown[],
}));

vi.mock('@config/logger', () => ({ Logger: state.logger }));

const adapterModule = () => ({ create: (config: unknown) => state.factory(config) });
vi.mock('@orm/adapters/PostgreSQLAdapter', () => ({ PostgreSQLAdapter: adapterModule() }));
vi.mock('@orm/adapters/MySQLAdapter', () => ({ MySQLAdapter: adapterModule() }));
vi.mock('@orm/adapters/SQLServerAdapter', () => ({ SQLServerAdapter: adapterModule() }));
vi.mock('@orm/adapters/D1Adapter', () => ({ D1Adapter: adapterModule() }));
vi.mock('@orm/adapters/D1RemoteAdapter', () => ({ D1RemoteAdapter: adapterModule() }));
vi.mock('@orm/adapters/SQLiteAdapter', () => ({ SQLiteAdapter: adapterModule() }));

vi.mock('@zintrust/client-rds-data', () => ({
  getRdsDataClient: async () => {
    if (state.auroraError !== undefined) throw state.auroraError;
    return {
      executeStatement: async (input: unknown) => {
        state.executeCalls.push(input);
        return state.auroraResponse;
      },
    };
  },
  getSecretsManagerClient: async () => ({ getSecretValue: async () => ({}) }),
}));

const makeAdapter = (overrides: Record<string, unknown> = {}): any => ({
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  ping: vi.fn(async () => undefined),
  isConnected: () => true,
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  queryOne: vi.fn(async () => null),
  transaction: vi.fn(async <T>(fn: (a: any) => Promise<T>) => fn({} as any)),
  rawQuery: vi.fn(async () => []),
  getType: () => 'sqlite',
  getPlaceholder: () => '?',
  ...overrides,
});

const loadManager = async () => {
  vi.resetModules();
  return import('@orm/ConnectionManager');
};

describe('ConnectionManager uncovered branches', () => {
  beforeEach(async () => {
    const { ConnectionManager } = await import('@orm/ConnectionManager');
    await ConnectionManager.shutdownIfInitialized();

    vi.resetModules();
    const registry = (globalThis as any).__zintrust_db_adapter_registry__ as Map<string, unknown>;
    if (registry) registry.clear();
    state.adapter = makeAdapter();
    state.factory.mockReset();
    state.factory.mockImplementation(() => state.adapter);
    state.logger.info.mockReset();
    state.logger.warn.mockReset();
    state.logger.error.mockReset();
    state.auroraError = undefined;
    state.auroraResponse = {};
    state.executeCalls = [];
    vi.stubEnv('AURORA_RESOURCE_ARN', 'arn:aws:rds:us-east-1:1:cluster:test');
    vi.stubEnv('AURORA_SECRET_ARN', 'arn:aws:secretsmanager:us-east-1:1:secret:test');
  });

  afterEach(async () => {
    const { ConnectionManager } = await import('@orm/ConnectionManager');
    await ConnectionManager.shutdownIfInitialized();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects aurora-data-api adapters and logs adapter creation', async () => {
    const { ConnectionManager } = await loadManager();
    const manager = ConnectionManager.getInstance({
      adapter: 'aurora-data-api',
      database: 'db',
    });

    await expect(manager.getConnection('x')).rejects.toThrow(/should be created via/i);
    expect(state.logger.info).toHaveBeenCalledWith(expect.stringContaining('aurora-data-api'));
  });

  it('builds every built-in driver through the switch fallback', async () => {
    const { ConnectionManager } = await loadManager();
    const drivers = ['postgresql', 'mysql', 'sqlserver', 'd1', 'd1-remote', 'sqlite'] as const;

    for (const driver of drivers) {
      const manager = ConnectionManager.getInstance({ adapter: driver, database: 'db' });
      await expect(manager.getConnection(driver)).resolves.toBe(state.adapter);
      await manager.closeAll();
    }
    expect(state.factory).toHaveBeenCalledTimes(drivers.length);
  });

  it('creates a new connection when the existing entry is not an adapter or not connected', async () => {
    const invalid = () => makeAdapter({ ping: undefined, disconnect: undefined, isConnected: undefined });
    state.adapter = invalid();
    state.factory.mockImplementation(invalid);
    const { ConnectionManager } = await loadManager();
    const manager = ConnectionManager.getInstance({ adapter: 'sqlite', database: 'db' });

    const first = await manager.getConnection('a');
    const second = await manager.getConnection('a');
    expect(second).not.toBe(first);
    expect(manager.getPoolStats().total).toBe(1);

    await manager.closeAll();
    expect(first.disconnect).toBeUndefined();
  });

  it('logs failed health checks and reuses idle connections', async () => {
    state.adapter = makeAdapter({
      ping: vi.fn(async () => {
        throw new Error('ping failed');
      }),
    });
    const { ConnectionManager } = await loadManager();
    const manager = ConnectionManager.getInstance({ adapter: 'sqlite', database: 'db' });

    await manager.getConnection('a');
    await manager.getConnection('b');
    await manager.getConnection('a');
    expect(state.logger.warn).toHaveBeenCalledWith(
      'Connection health check failed',
      expect.any(Error)
    );

    await manager.releaseConnection('b');
    await manager.getConnection('c');
    expect(manager.getPoolStats().active).toBe(2);
  });

  it('covers both unrefable timer branches with stubbed timer factories', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const realSetInterval = globalThis.setInterval;

    vi.stubGlobal('setInterval', () => 1);
    vi.stubGlobal('setTimeout', () => 2);
    const { ConnectionManager: PlainManager } = await loadManager();
    const plain = PlainManager.getInstance({
      adapter: 'sqlite',
      database: 'db',
      maxConnections: 1,
    });
    await plain.getConnection('a');
    const plainPending = plain.getConnection('b');
    await new Promise((resolve) => setImmediate(resolve));
    await plain.releaseConnection('a');
    await expect(plainPending).resolves.toBeDefined();
    await plain.closeAll();
    vi.unstubAllGlobals();

    vi.stubGlobal('setInterval', (fn: () => void, ms: number) =>
      Object.assign(realSetInterval(fn, ms), { unref: vi.fn() })
    );
    vi.stubGlobal('setTimeout', (fn: () => void, ms: number) =>
      Object.assign(realSetTimeout(fn, ms), { unref: vi.fn() })
    );
    const { ConnectionManager: UnrefManager } = await loadManager();
    const unref = UnrefManager.getInstance({
      adapter: 'sqlite',
      database: 'db',
      maxConnections: 1,
    });
    await unref.getConnection('a');
    const pending = unref.getConnection('b');
    await new Promise((resolve) => setImmediate(resolve));
    await unref.releaseConnection('a');
    await expect(pending).resolves.toBeDefined();
    await unref.closeAll();
    vi.unstubAllGlobals();
  });

  it('executes Aurora statements with defaults and optional parameters', async () => {
    const { ConnectionManager } = await loadManager();
    const manager = ConnectionManager.getInstance({ adapter: 'sqlite', database: 'db' });
    const aurora = await manager.getAuroraDataApiConnection();

    await expect(aurora.execute('SELECT 1')).resolves.toEqual({
      numberOfRecordsUpdated: 0,
      records: [],
    });
    await expect(aurora.batch([{ sql: 'SELECT 1', params: [1, 'x'] }])).resolves.toEqual([
      { numberOfRecordsUpdated: 0, records: [] },
    ]);
    expect(state.executeCalls[0]).toEqual(
      expect.objectContaining({
        sql: 'SELECT 1',
        parameters: [],
      })
    );
    expect((state.executeCalls[1] as any).parameters).toEqual([
      { value: { stringValue: '1' } },
      { value: { stringValue: 'x' } },
    ]);
  });

  it('maps missing optional Aurora package errors to a config error', async () => {
    const cases = [
      Object.assign(new Error("Cannot find package '@zintrust/client-rds-data'"), {
        code: 'ERR_MODULE_NOT_FOUND',
      }),
      new Error("Cannot find package '@zintrust/client-rds-data'"),
    ];

    try {
      for (const auroraError of cases) {
        vi.doMock('@zintrust/client-rds-data', () => {
          throw auroraError;
        });
        const { ConnectionManager } = await loadManager();
        const manager = ConnectionManager.getInstance({ adapter: 'sqlite', database: 'db' });
        const aurora = await manager.getAuroraDataApiConnection();
        await expect(aurora.execute('SELECT 1')).rejects.toThrow(
          /requires '@zintrust\/client-rds-data'|Failed to load @zintrust\/client-rds-data/i
        );
        await manager.closeAll();
      }

      vi.doMock('@zintrust/client-rds-data', () => {
        throw new Error('other failure');
      });
      const { ConnectionManager } = await loadManager();
      const manager = ConnectionManager.getInstance({ adapter: 'sqlite', database: 'db' });
      const aurora = await manager.getAuroraDataApiConnection();
      await expect(aurora.execute('SELECT 1')).rejects.toThrow(
        /Failed to load @zintrust\/client-rds-data/i
      );
    } finally {
      vi.doUnmock('@zintrust/client-rds-data');
    }
  });

  it('rejects connection pool exhaustion with queued waiters', async () => {
    const { ConnectionManager } = await loadManager();
    vi.useFakeTimers();
    const manager = ConnectionManager.getInstance({
      adapter: 'sqlite',
      database: 'db',
      maxConnections: 1,
    });

    await manager.getConnection('a');
    const pending = manager.getConnection('b').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30001);
    const timeoutError = await pending;
    expect((timeoutError as Error).message).toMatch(/Connection pool exhausted/i);
    await manager.closeAll();
  });

  it('rejects queued waiters on shutdown', async () => {
    const { ConnectionManager } = await loadManager();
    const manager = ConnectionManager.getInstance({
      adapter: 'sqlite',
      database: 'db',
      maxConnections: 1,
    });

    await manager.getConnection('a');
    const queued = manager.getConnection('c').catch((error: unknown) => error);
    await new Promise((resolve) => setImmediate(resolve));
    await manager.closeAll();
    const shutdownError = await queued;
    expect((shutdownError as Error).message).toMatch(/shutting down/i);
  });
});
