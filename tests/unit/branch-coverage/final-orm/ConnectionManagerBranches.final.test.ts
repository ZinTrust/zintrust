/* eslint-disable @typescript-eslint/no-explicit-any, no-await-in-loop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Driver = 'postgresql' | 'mysql' | 'sqlserver' | 'd1' | 'd1-remote' | 'sqlite';

const originalEnv = { ...process.env };
const savedFactories = new Map<string, unknown>();

const makeAdapter = (overrides: Record<string, unknown> = {}): any => ({
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  queryOne: vi.fn(async () => null),
  ping: vi.fn(async () => undefined),
  transaction: vi.fn(async <T,>(fn: (adapter: any) => Promise<T>) => fn({} as any)),
  rawQuery: vi.fn(async () => []),
  getType: () => 'sqlite',
  isConnected: () => true,
  getPlaceholder: () => '?',
  ...overrides,
});

const registerAdapter = async (driver: Driver, adapter: any): Promise<void> => {
  const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
  if (!savedFactories.has(driver)) savedFactories.set(driver, DatabaseAdapterRegistry.get(driver));
  DatabaseAdapterRegistry.register(driver, () => adapter);
};

const loadManager = async (config: Record<string, unknown> = {}) => {
  const { ConnectionManager } = await import('@orm/ConnectionManager');
  const instance = ConnectionManager.getInstance({
    adapter: 'sqlite',
    database: ':memory:',
    ...config,
  } as any);
  return { ConnectionManager, instance };
};

describe('ConnectionManager uncovered branches (final-orm)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    try {
      const { ConnectionManager } = await import('@orm/ConnectionManager');
      await ConnectionManager.shutdownIfInitialized();
    } catch {
      // best-effort cleanup
    }
    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    for (const [driver, factory] of savedFactories.entries()) {
      if (factory === undefined) {
        // keep the built-in default registration if one existed; do not delete global state
        continue;
      }
      DatabaseAdapterRegistry.register(driver as Driver, factory as any);
    }
    savedFactories.clear();
    process.env = { ...originalEnv };
    vi.doUnmock('@zintrust/client-rds-data');
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recreates a connection when the existing adapter reports disconnected', async () => {
    let created = 0;
    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    if (!savedFactories.has('sqlite')) {
      savedFactories.set('sqlite', DatabaseAdapterRegistry.get('sqlite'));
    }
    DatabaseAdapterRegistry.register('sqlite', () => {
      created += 1;
      return makeAdapter({ isConnected: () => false });
    });
    const { instance } = await loadManager();

    const first = await instance.getConnection('a');
    const second = await instance.getConnection('a');

    expect(created).toBe(2);
    expect(second).not.toBe(first);
  });

  it('falls back to built-in adapter factories when no factory is registered', async () => {
    const registry = (globalThis as any).__zintrust_db_adapter_registry__ as
      | Map<string, unknown>
      | undefined;
    const drivers: Array<[Driver, string]> = [
      ['postgresql', '@orm/adapters/PostgreSQLAdapter'],
      ['mysql', '@orm/adapters/MySQLAdapter'],
      ['sqlserver', '@orm/adapters/SQLServerAdapter'],
      ['d1', '@orm/adapters/D1Adapter'],
      ['d1-remote', '@orm/adapters/D1RemoteAdapter'],
      ['sqlite', '@orm/adapters/SQLiteAdapter'],
    ];

    for (const [driver, modulePath] of drivers) {
      const hadEntry = registry?.has(driver) ?? false;
      const previous = registry?.get(driver);
      registry?.delete(driver);
      vi.resetModules();
      vi.doMock(modulePath, () => ({ [modulePath.split('/').at(-1)]: { create: () => makeAdapter() } }));

      try {
        const { ConnectionManager } = await import('@orm/ConnectionManager');
        const instance = ConnectionManager.getInstance({
          adapter: driver,
          database: 'db',
        } as any);
        const connection = await instance.getConnection(`conn-${driver}`);
        expect(connection.connect).toHaveBeenCalled();
        await instance.closeAll();
      } finally {
        if (registry && hadEntry) registry.set(driver, previous);
      }
    }
  });

  it('returns the existing healthy connection and ignores unknown release ids', async () => {
    const adapter = makeAdapter();
    await registerAdapter('sqlite', adapter);
    const { ConnectionManager, instance } = await loadManager();

    const first = await instance.getConnection('healthy');
    const second = await instance.getConnection('healthy');
    expect(second).toBe(first);

    await expect(instance.releaseConnection('missing')).resolves.toBeUndefined();
    await expect(ConnectionManager.getConnection('healthy')).resolves.toBe(first);
    await expect(ConnectionManager.releaseConnection('healthy')).resolves.toBeUndefined();
    expect(ConnectionManager.getInstance()).toBe(instance);
  });

  it('reuses an idle pooled connection when capacity is exhausted', async () => {
    const adapter = makeAdapter();
    await registerAdapter('sqlite', adapter);
    const { instance } = await loadManager({ maxConnections: 1 });

    await instance.getConnection('first');
    await instance.releaseConnection('first');
    expect(instance.getPoolStats()).toEqual({ total: 1, active: 0, idle: 1, queued: 0 });
    await vi.advanceTimersByTimeAsync(1);

    const reused = await instance.getConnection('second');
    expect(reused).toBe(adapter);
    expect(instance.getPoolStats()).toEqual({ total: 1, active: 1, idle: 0, queued: 0 });
  });

  it('idle cleanup skips active entries and removes stale inactive connections', async () => {
    const adapter = makeAdapter();
    await registerAdapter('sqlite', adapter);
    const { instance } = await loadManager({ idleTimeout: 1 });

    await instance.getConnection('idle');
    await vi.advanceTimersByTimeAsync(300000);
    expect(instance.getPoolStats().total).toBe(1);

    await instance.releaseConnection('idle');
    await vi.advanceTimersByTimeAsync(300000);

    expect(instance.getPoolStats().total).toBe(0);
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  it('rejects queued waiters on shutdown and tolerates repeated closeAll', async () => {
    const adapter = makeAdapter();
    await registerAdapter('sqlite', adapter);
    const { instance } = await loadManager({ maxConnections: 1 });

    await instance.getConnection('active');
    const pending = instance.getConnection('queued');
    const failure = pending.then(
      () => undefined,
      (error: unknown) => error
    );
    await Promise.resolve();
    await Promise.resolve();

    await instance.releaseConnection('active');
    expect(await pending).toBe(adapter);

    const nextPending = instance.getConnection('queued-2');
    const nextFailure = nextPending.then(
      () => undefined,
      (error: unknown) => error
    );
    await Promise.resolve();
    await Promise.resolve();
    await instance.closeAll();
    expect(await nextFailure).toBeInstanceOf(Error);
    await expect(failure).resolves.toBeUndefined();

    await expect(instance.closeAll()).resolves.toBeUndefined();
  });

  it('throws when the singleton is requested before initialization', async () => {
    vi.resetModules();
    const { ConnectionManager } = await import('@orm/ConnectionManager');
    expect(() => ConnectionManager.getInstance()).toThrow(/not initialized/i);
  });

  it.each([
    ['null error', null],
    ['non-string code and message', { code: 42, message: 7 }],
    ['module not found with empty message', { code: 'ERR_MODULE_NOT_FOUND', message: '' }],
    [
      'module not found naming the package',
      { code: 'ERR_MODULE_NOT_FOUND', message: "Cannot find '@zintrust/client-rds-data'" },
    ],
    [
      'cannot find package message',
      { code: 'OTHER', message: "Cannot find package '@zintrust/client-rds-data'" },
    ],
    ['generic error', { code: 'OTHER', message: 'boom' }],
  ])('handles optional module import failure: %s', async (_label, thrown) => {
    vi.doMock('@zintrust/client-rds-data', () => {
      throw thrown;
    });

    const { getDatabaseSecret } = await import('@orm/ConnectionManager');
    await expect(getDatabaseSecret('secret')).rejects.toThrow();
  });
});
