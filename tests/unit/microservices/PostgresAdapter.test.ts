import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakePass = 'pdd';

vi.mock('@config/logger', () => {
  const Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    scope: vi.fn(),
  };
  return { Logger };
});

type MockQueryResult = { rows: unknown[]; rowCount?: number };

type ListenerMap = Record<string, ((...args: unknown[]) => void) | undefined>;

class MockClient {
  public readonly query = vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
      return { rows: [] };
    }
  );

  public readonly release = vi.fn((): void => undefined);
}

class MockPool {
  public readonly options: Record<string, unknown>;
  public readonly listeners: ListenerMap = {};

  public totalCount = 1;
  public idleCount = 1;
  public waitingCount = 0;

  public readonly end = vi.fn(async (): Promise<void> => undefined);

  public readonly query = vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
  );

  public readonly connect = vi.fn(async (): Promise<MockClient> => new MockClient());

  public readonly on = vi.fn((event: string, listener: (...args: unknown[]) => void): this => {
    this.listeners[event] = listener;
    return this;
  });

  public constructor(options: Record<string, unknown>) {
    this.options = options;
  }
}

let lastPool: MockPool | undefined;
let nextConnectError: Error | undefined;

vi.mock('pg', () => {
  lastPool = undefined;
  nextConnectError = undefined;

  class Pool {
    public readonly _isMock = true;

    public constructor(options: Record<string, unknown>) {
      lastPool = new MockPool(options);

      if (nextConnectError !== undefined) {
        lastPool.connect.mockRejectedValueOnce(nextConnectError);
        nextConnectError = undefined;
      }

      return lastPool as unknown as Pool; // NOSONAR
    }
  }

  return {
    Pool,
    __getLastPool: (): MockPool | undefined => lastPool,
    __setNextConnectError: (err: Error): void => {
      nextConnectError = err;
    },
  };
});

describe('PostgresAdapter', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('computes pool key for shared vs isolated', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');

    const shared = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
      isolation: 'shared',
    });

    expect(shared.getPoolKey()).toBe('localhost:5432/db');

    const isolated = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
      isolation: 'isolated',
      serviceName: 'orders',
    });

    expect(isolated.getPoolKey()).toBe('localhost:5432/orders');
  });

  it('getPool throws before connect', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    expect(() => adapter.getPool()).toThrow(/Call connect\(\) first/);
  });

  it('connect initializes pool, registers error listener, and reuses on second call', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');
    const { Logger } = await import('@config/logger');
    // @ts-ignore
    const pg = (await import('pg')) as unknown as {
      __getLastPool: () => MockPool | undefined;
    };

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    await adapter.connect();

    const pool = pg.__getLastPool();
    expect(pool).toBeDefined();
    expect(pool?.on).toHaveBeenCalledWith('error', expect.any(Function));

    pool?.listeners['error']?.(new Error('boom'));
    expect(Logger.error).toHaveBeenCalled();

    await adapter.connect();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Reusing existing connection pool')
    );
  });

  it('connect throws wrapped error when pg connect fails', async (): Promise<void> => {
    // @ts-ignore
    const pg = (await import('pg')) as unknown as {
      __setNextConnectError: (err: Error) => void;
    };
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');

    pg.__setNextConnectError(new Error('pg down'));

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    await expect(adapter.connect()).rejects.toThrow(
      'Failed to initialize PostgreSQL pool: pg down'
    );
  });

  it('query/execute return rows and handle rowCount default', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');
    // @ts-ignore
    const pg = (await import('pg')) as unknown as {
      __getLastPool: () => MockPool | undefined;
    };

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    await adapter.connect();
    const pool = pg.__getLastPool();
    expect(pool).toBeDefined();

    pool?.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    await expect(adapter.query<{ id: number }>('SELECT 1')).resolves.toEqual([{ id: 1 }]);

    pool?.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    await expect(adapter.execute<{ id: number }>('SELECT 2')).resolves.toEqual({
      rows: [{ id: 2 }],
      rowCount: 0,
    });
  });

  it('transaction commits on success and rolls back on failure', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');
    // @ts-ignore
    const pg = (await import('pg')) as unknown as {
      __getLastPool: () => MockPool | undefined;
    };

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    await adapter.connect();

    const pool = pg.__getLastPool();
    const client = new MockClient();
    pool?.connect.mockResolvedValueOnce(client);

    await expect(
      adapter.transaction(async (c) => {
        await c.query('SELECT 42');
        return 'ok';
      })
    ).resolves.toBe('ok');

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);

    const failingClient = new MockClient();
    pool?.connect.mockResolvedValueOnce(failingClient);

    await expect(
      adapter.transaction(async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');

    expect(failingClient.query).toHaveBeenCalledWith('BEGIN');
    expect(failingClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(failingClient.release).toHaveBeenCalledTimes(1);
  });

  it('createServiceSchema skips in shared mode and attempts create in isolated mode', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');
    const { Logger } = await import('@config/logger');

    const shared = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
      isolation: 'shared',
    });

    const sharedQuerySpy = vi.spyOn(shared, 'query');
    await shared.createServiceSchema('svc');
    expect(sharedQuerySpy).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('skipping schema creation'));

    const isolated = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
      isolation: 'isolated',
    });

    const isolatedQuerySpy = vi.spyOn(isolated, 'query').mockResolvedValueOnce([] as unknown[]);
    await isolated.createServiceSchema('svc');
    expect(isolatedQuerySpy).toHaveBeenCalledWith('CREATE SCHEMA IF NOT EXISTS "svc"');

    isolatedQuerySpy.mockRejectedValueOnce(new Error('nope'));
    await isolated.createServiceSchema('svc');
    expect(Logger.error).toHaveBeenCalled();
  });

  it('runMigrations releases client and healthCheck returns boolean', async (): Promise<void> => {
    const { PostgresAdapter } = await import('@/microservices/PostgresAdapter');
    // @ts-ignore
    const pg = (await import('pg')) as unknown as {
      __getLastPool: () => MockPool | undefined;
    };

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    });

    await adapter.connect();

    const pool = pg.__getLastPool();
    const client = new MockClient();
    pool?.connect.mockResolvedValueOnce(client);

    const m1 = { up: vi.fn(async (_c: unknown) => undefined) };
    const m2 = { up: vi.fn(async (_c: unknown) => undefined) };

    await adapter.runMigrations([m1, m2]);
    expect(m1.up).toHaveBeenCalledTimes(1);
    expect(m2.up).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);

    pool?.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    await expect(adapter.healthCheck()).resolves.toBe(true);

    pool?.query.mockRejectedValueOnce(new Error('down'));
    await expect(adapter.healthCheck()).resolves.toBe(false);
  });

  it('disconnect/disconnectAll are safe and adapter manager caches instances', async (): Promise<void> => {
    const mod = await import('@/microservices/PostgresAdapter');

    const cfg = {
      host: 'localhost',
      port: 5432,
      database: 'db',
      user: 'u',
      password: fakePass,
    };

    const a1 = mod.getInstance(cfg, 'k');
    const a2 = mod.getInstance(cfg, 'k');
    expect(a1).toBe(a2);

    expect(mod.getAllInstances().length).toBeGreaterThanOrEqual(1);

    const spy = vi.spyOn(a1, 'disconnectAll');
    await mod.disconnectAll();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mod.getAllInstances()).toEqual([]);

    const adapter = mod.PostgresAdapter.create(cfg);
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    await expect(adapter.disconnectAll()).resolves.toBeUndefined();
  });
});
