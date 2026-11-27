/* eslint-disable no-empty-function -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'production',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    USE_REDIS_PROXY: false,
  } as Record<string, unknown>,
  workersEnv: null as unknown,
  createRedisConnection: vi.fn(),
  connect: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get NODE_ENV() { return m.env['NODE_ENV']; },
    get REDIS_HOST() { return m.env['REDIS_HOST']; },
    get REDIS_PORT() { return m.env['REDIS_PORT']; },
    get USE_REDIS_PROXY() { return m.env['USE_REDIS_PROXY']; },
    REQUEST_TIMEOUT: 30_000,
    get: (key: string, fallback = '') => m.env[key] ?? fallback,
    getInt: (key: string, fallback = 0) => m.env[key] ?? fallback,
  },
}));

vi.mock('@config/cloudflare', () => ({
  Cloudflare: { getWorkersEnv: () => m.workersEnv },
}));

vi.mock('@config/workers', () => ({
  createRedisConnection: (...args: unknown[]) => m.createRedisConnection(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: (...args: unknown[]) => m.loggerError(...args),
    warn: (...args: unknown[]) => m.loggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@node-singletons/net', () => ({
  connect: (...args: unknown[]) => m.connect(...args),
}));

vi.mock('@tools/redis/RedisKeyManager', () => ({
  RedisKeys: { createCacheKey: (key: string) => `cache:${key}` },
}));

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  public destroyed = false;
  public writes: string[] = [];
  public destroyedByTimeout = false;
  private listeners = new Map<string, Listener[]>();

  public constructor(private responses: Record<string, unknown> = {}) {}

  public once(event: string, cb: Listener) {
    this.add(event, cb);
  }

  public on(event: string, cb: Listener) {
    this.add(event, cb);
  }

  public removeListener(event: string, cb: Listener) {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(event, list.filter((entry) => entry !== cb));
  }

  public setTimeout() {}

  public destroy() {
    this.destroyedByTimeout = true;
    this.destroyed = true;
  }

  public write(command: string) {
    this.writes.push(command);
    const key = Object.keys(this.responses).find((candidate) => command.startsWith(candidate));
    const response = key === undefined ? '+OK\r\n' : this.responses[key];
    this.emit('data', response);
  }

  public emit(event: string, ...args: unknown[]) {
    for (const cb of [...(this.listeners.get(event) ?? [])]) cb(...args);
  }

  private add(event: string, cb: Listener) {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }
}

describe('RedisDriver remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.env = {
      NODE_ENV: 'production',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      USE_REDIS_PROXY: false,
    };
    m.workersEnv = null;
    m.createRedisConnection.mockReset();
    m.createRedisConnection.mockReturnValue(null);
    m.connect.mockReset();
    m.connect.mockImplementation((_port: number, _host: string, onConnect: () => void) => {
      const socket = new FakeSocket();
      queueMicrotask(onConnect);
      return socket;
    });
  });

  afterEach(() => {
    m.env['NODE_ENV'] = 'production';
    m.workersEnv = null;
  });

  it('skips ioredis in test environments and reports initialization failures', async () => {
    m.env['NODE_ENV'] = 'testing';
    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    RedisDriver.create();
    expect(m.createRedisConnection).not.toHaveBeenCalled();

    m.env['NODE_ENV'] = 'production';
    m.createRedisConnection.mockImplementationOnce(() => {
      throw new Error('bad config');
    });
    const driver = RedisDriver.create();
    expect(m.loggerWarn).toHaveBeenCalledWith(
      'Redis cache driver falling back to TCP socket implementation',
      expect.any(Object)
    );
    expect(() => driver.getRedisClient!()).toThrow(/only supported with ioredis/);

    m.env['USE_REDIS_PROXY'] = true;
    m.env['REDIS_PROXY_URL'] = 'http://proxy';
    m.createRedisConnection.mockImplementationOnce(() => {
      throw 'string failure';
    });
    expect(() => RedisDriver.create()).toThrow();
    expect(m.loggerError).toHaveBeenCalled();

    m.workersEnv = {};
    m.createRedisConnection.mockImplementationOnce(() => {
      throw new Error('workers failure');
    });
    expect(() => RedisDriver.create()).toThrow();
  });

  it('uses an ioredis-like client including mget/increment fallbacks', async () => {
    const client = {
      get: vi.fn(async (key: string) => {
        if (key === 'cache:bad') return 'not json';
        if (key === 'cache:count') return '5';
        return '"value"';
      }),
      mget: vi.fn(async () => ['"a"', 'null', 'bad json']),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      flushdb: vi.fn(async () => 'OK'),
      exists: vi.fn(async () => 1),
      incrby: undefined,
      decrby: undefined,
    };
    m.createRedisConnection.mockReturnValue(client);
    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    expect(driver.getRedisClient!()).toBe(client);
    await expect(driver.get<string>('key')).resolves.toBe('value');
    await expect(driver.get('bad')).resolves.toBeNull();

    await expect(driver.many!(['a', 'b', 'c'])).resolves.toEqual(['a', null, null]);
    await expect(driver.many!([])).resolves.toEqual([]);
    client.mget = undefined;
    await expect(driver.many!(['key'])).resolves.toEqual(['value']);

    await driver.set('key', { a: 1 });
    expect(client.set).toHaveBeenCalledWith('cache:key', '{"a":1}');
    await driver.set('key', 'v', 5);
    expect(client.set).toHaveBeenLastCalledWith('cache:key', '"v"', 'EX', 5);
    await driver.delete('key');
    await driver.clear();
    await expect(driver.has('key')).resolves.toBe(true);

    await expect(driver.increment!('count', 2)).resolves.toBe(7);
    expect(client.set).toHaveBeenLastCalledWith('cache:count', '7');
    client.get.mockResolvedValueOnce(null);
    await expect(driver.decrement!('fresh', 3)).resolves.toBe(-3);
    expect(client.set).toHaveBeenLastCalledWith('cache:fresh', '-3');

    client.get.mockRejectedValueOnce(new Error('read failed'));
    await expect(driver.get('key')).resolves.toBeNull();
  });

  it('handles ioredis command failures and numeric operations', async () => {
    const client = {
      get: vi.fn(async () => '1'),
      mget: vi.fn(async () => {
        throw new Error('mget failed');
      }),
      set: vi.fn(async () => {
        throw new Error('set failed');
      }),
      del: vi.fn(async () => {
        throw new Error('del failed');
      }),
      flushdb: vi.fn(async () => {
        throw new Error('flush failed');
      }),
      exists: vi.fn(async () => {
        throw new Error('exists failed');
      }),
      incrby: vi.fn(async () => {
        throw new Error('incr failed');
      }),
      decrby: vi.fn(async () => {
        throw new Error('decr failed');
      }),
    };
    m.createRedisConnection.mockReturnValue(client);
    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.many!(['a'])).resolves.toEqual([null]);
    await expect(driver.set('a', 1)).resolves.toBeUndefined();
    await expect(driver.delete('a')).resolves.toBeUndefined();
    await expect(driver.clear()).resolves.toBeUndefined();
    await expect(driver.has('a')).resolves.toBe(false);
    await expect(driver.increment!('a')).resolves.toBe(0);
    await expect(driver.decrement!('a')).resolves.toBe(0);
    expect(m.loggerError).toHaveBeenCalled();
  });

  it('falls back to TCP socket with binary data, timeouts and non-Error failures', async () => {
    const socket = new FakeSocket({
      GET: '$5\r\n"hi"\r\n',
      EXISTS: ':1\r\n',
      INCRBY: ':abc\r\n',
      DECRBY: ':3\r\n',
    });
    m.connect.mockImplementation((_port: number, _host: string, onConnect: () => void) => {
      queueMicrotask(onConnect);
      return socket;
    });

    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.get<string>('myKey')).resolves.toBe('hi');
    await expect(driver.set('myKey', 'v', 5)).resolves.toBeUndefined();
    expect(socket.writes.at(-1)).toBe('SETEX cache:myKey 5 "v"\r\n');
    await driver.set('myKey', 'v');
    expect(socket.writes.at(-1)).toBe('SET cache:myKey "v"\r\n');
    await driver.delete('myKey');
    await driver.clear();
    await expect(driver.has('myKey')).resolves.toBe(true);
    await expect(driver.increment!('myKey')).resolves.toBe(0);
    await expect(driver.decrement!('myKey')).resolves.toBe(3);

    socket.emit('data', 'duplicate response');

    const silentSocket = new FakeSocket();
    silentSocket.write = (command: string) => {
      silentSocket.writes.push(command);
    };
    m.connect.mockImplementationOnce((_p: number, _h: string, cb: () => void) => {
      queueMicrotask(cb);
      return silentSocket;
    });
    const nextDriver = RedisDriver.create();
    const errorPending = nextDriver.get('key');
    await new Promise((resolve) => setImmediate(resolve));
    silentSocket.emit('error', 'plain error');
    await expect(errorPending).resolves.toBeNull();
    expect(m.loggerError).toHaveBeenCalled();
  });

  it('reports TCP connection timeout and non-Error connection failures', async () => {
    const timeoutSocket = new FakeSocket();
    m.connect.mockImplementationOnce(() => timeoutSocket);
    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    const pending = driver.get('key');
    // Allow the socket connect callback to register listeners.
    await new Promise((resolve) => setImmediate(resolve));
    timeoutSocket.emit('timeout');
    await expect(pending).resolves.toBeNull();
    expect(timeoutSocket.destroyedByTimeout).toBe(true);

    const errorSocket = new FakeSocket();
    m.connect.mockImplementationOnce(() => errorSocket);
    await Promise.resolve();
    const errorPending = driver.has('key');
    await new Promise((resolve) => setImmediate(resolve));
    errorSocket.emit('error', 'offline');
    await expect(errorPending).resolves.toBe(false);

    const commandTimeoutSocket = new FakeSocket();
    commandTimeoutSocket.write = (command: string) => {
      commandTimeoutSocket.writes.push(command);
    };
    m.connect.mockImplementationOnce((_p: number, _h: string, cb: () => void) => {
      queueMicrotask(cb);
      return commandTimeoutSocket;
    });
    const driver2 = RedisDriver.create();
    const timeoutPending = driver2.get('key');
    await new Promise((resolve) => setImmediate(resolve));
    commandTimeoutSocket.emit('timeout');
    await expect(timeoutPending).resolves.toBeNull();
  });

  it('parses string and object socket data and tolerates missing listeners', async () => {
    const listeners: Record<string, Listener[]> = {};
    const add = (event: string, cb: Listener) => {
      listeners[event] ??= [];
      listeners[event]?.push(cb);
    };
    const socket = {
      destroyed: false,
      setTimeout: undefined,
      removeListener: undefined,
      once: add,
      on: add,
      write: () => {
        for (const cb of [...(listeners['data'] ?? [])]) {
          cb(null);
          cb({ toString: () => '"from-object"' });
          cb(42);
        }
      },
      destroy: undefined,
    };
    m.connect.mockImplementationOnce((_p: number, _h: string, cb: () => void) => {
      queueMicrotask(cb);
      return socket;
    });
    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();
    await expect(driver.get('key')).resolves.toBeNull();
  });
});
