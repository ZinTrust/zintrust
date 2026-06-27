import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createZedgiClient = vi.fn();
const redisClient = {
  ping: vi.fn(async () => 'PONG'),
  get: vi.fn(async () => JSON.stringify({ ok: true })),
  set: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 1),
  exists: vi.fn(async () => 1),
  pipeline: vi.fn(async () => [JSON.stringify(1), null]),
  incrby: vi.fn(async () => 2),
  decrby: vi.fn(async () => 1),
  call: vi.fn(async () => 'OK'),
};
const mysqlClient = {
  ping: vi.fn(async () => ({ pong: true })),
  query: vi.fn(async () => ({ rows: [{ id: 1 }], fields: ['id'] })),
  transaction: vi.fn(async () => []),
};
const postgresClient = {
  ping: vi.fn(async () => ({ pong: true })),
  query: vi.fn(async () => ({ rows: [{ id: 1 }], rowCount: 1, fields: [{ name: 'id' }] })),
  transaction: vi.fn(async () => []),
};
const queueClient = {
  add: vi.fn(async () => ({ id: 'job-1' })),
  count: vi.fn(async () => 3),
  drain: vi.fn(async () => true),
  removeJob: vi.fn(async () => true),
};

vi.mock('@zedgi/zedgi-client', () => ({
  createZedgiClient,
}));

describe('@zintrust/zedgi drivers', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    createZedgiClient.mockReturnValue({
      redis: vi.fn(() => redisClient),
      mysql: vi.fn(() => mysqlClient),
      postgres: vi.fn(() => postgresClient),
      queue: vi.fn(() => queueClient),
    });
    const { Env } = await import('@config/env');
    const { FeatureFlags } = await import('@config/features');
    Env.setSource({
      ZEDGI_URL: 'https://example.zedgi.test',
      ZEDGI_KEY: 'zk_test',
      REDIS_PASSWORD: 'redis-secret',
      DB_USERNAME: 'app',
      DB_PASSWORD: 'db-secret',
      DB_DATABASE: 'app',
      USE_RAW_QRY: 'true',
    });
    FeatureFlags.setRawQueryEnabled(true);
  });

  afterEach(async () => {
    const { Env } = await import('@config/env');
    const { FeatureFlags } = await import('@config/features');
    Env.setSource(null);
    FeatureFlags.reset();
  });

  it('creates one client and sends stable credentials without host or port', async () => {
    const { ZedgiRuntime } = await import('@/../packages/zedgi/src/ZedgiRuntime');

    ZedgiRuntime.redis({
      driver: 'redis-zedgi',
      password: 'redis-secret',
      database: 2,
      ttl: 60,
    }).get('a');
    ZedgiRuntime.sql({
      driver: 'mysql-zedgi',
      database: 'app',
      username: 'app',
      password: 'db-secret',
    }).query('select 1', []);
    ZedgiRuntime.queue('jobs', {
      driver: 'queue-zedgi',
      password: 'redis-secret',
      database: 1,
    }).count();

    expect(createZedgiClient).toHaveBeenCalledTimes(1);
    const options = createZedgiClient.mock.calls[0]?.[0] as {
      credentials: Record<string, Record<string, Record<string, unknown>>>;
    };
    expect(options.credentials.redis['redis-1']).toEqual({ password: 'redis-secret', db: 2 });
    expect(options.credentials.mysql['mysql-1']).toEqual({
      user: 'app',
      password: 'db-secret',
      database: 'app',
    });
    expect(options.credentials.redis['redis-2']).toEqual({ password: 'redis-secret', db: 1 });
    expect(JSON.stringify(options.credentials)).not.toContain('host');
    expect(JSON.stringify(options.credentials)).not.toContain('port');
  });

  it('maps cache operations to Zedgi redis calls', async () => {
    const { ZedgiCacheDriver } = await import('@/../packages/zedgi/src/ZedgiCacheDriver');
    const driver = ZedgiCacheDriver.create({ driver: 'redis-zedgi', ttl: 30, database: 0 });

    await expect(driver.get('k')).resolves.toEqual({ ok: true });
    await expect(driver.many?.<number>(['a', 'b'])).resolves.toEqual([1, null]);
    await driver.set('k', { v: 1 }, 10);
    await driver.delete('k');
    await expect(driver.has('k')).resolves.toBe(true);
    await expect(driver.increment?.('n', 2)).resolves.toBe(2);
    await expect(driver.decrement?.('n', 1)).resolves.toBe(1);
    await driver.clear();

    expect(redisClient.set).toHaveBeenCalledWith('k', JSON.stringify({ v: 1 }), 'EX', 10);
    expect(redisClient.del).toHaveBeenCalledWith('k');
    expect(redisClient.call).toHaveBeenCalledWith('FLUSHDB');
  });

  it('maps database calls and records write-only transactions', async () => {
    const { ZedgiDatabaseAdapter } = await import('@/../packages/zedgi/src/ZedgiDatabaseAdapter');
    const adapter = ZedgiDatabaseAdapter.create({
      driver: 'postgres-zedgi',
      database: 'app',
      username: 'app',
      password: 'db-secret',
      ssl: true,
    });

    await adapter.connect();
    await expect(adapter.query('select 1', [])).resolves.toEqual({ rows: [{ id: 1 }], rowCount: 1 });
    await expect(adapter.queryOne('select 1', [])).resolves.toEqual({ id: 1 });
    await expect(adapter.rawQuery('select 1', [])).resolves.toEqual([{ id: 1 }]);
    await adapter.transaction(async (tx) => {
      await tx.query('update users set name = $1 where id = $2', ['Ada', 1]);
      return 'ok';
    });

    expect(adapter.getType()).toBe('postgresql');
    expect(adapter.getPlaceholder(2)).toBe('$2');
    expect(postgresClient.transaction).toHaveBeenCalledWith([
      { sql: 'update users set name = $1 where id = $2', params: ['Ada', 1] },
    ]);
  });

  it('keeps queue dequeue unsupported and maps producer/management calls', async () => {
    const { ZedgiQueueDriver } = await import('@/../packages/zedgi/src/ZedgiQueueDriver');
    const driver = ZedgiQueueDriver.create({ driver: 'queue-zedgi', database: 1 });

    await expect(driver.enqueue('jobs', { hello: 'world' })).resolves.toBe('job-1');
    await expect(driver.length('jobs')).resolves.toBe(3);
    await driver.ack('jobs', 'job-1');
    await driver.drain('jobs');
    await expect(driver.dequeue('jobs')).rejects.toHaveProperty('code', 'CONFIG_ERROR');

    expect(queueClient.add).toHaveBeenCalled();
    expect(queueClient.removeJob).toHaveBeenCalledWith('job-1');
  });
});
