/* eslint-disable max-nested-callbacks */
import { describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

const makeSocket = (params: {
  on?: (event: string, cb: Listener) => void;
  once?: (event: string, cb: Listener) => void;
  setTimeout?: (ms: number) => void;
  removeListener?: (event: string, cb: Listener) => void;
  write?: (chunk: string) => void;
  destroy?: () => void;
}): unknown => {
  return {
    destroyed: false,
    ...params,
  };
};

describe('patch coverage: RedisDriver TCP socket branches', () => {
  it('logs fallback warning when ioredis init fails (non-workers, no proxy)', async () => {
    vi.resetModules();

    const warn = vi.fn();
    const error = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { warn, error } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'development',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((_k: string, fallback?: number) => fallback ?? 10),
      },
    }));

    vi.doMock('@config/workers', () => ({
      createRedisConnection: () => {
        throw new Error('boom');
      },
    }));

    // Ensure TCP driver can be created without attempting a real network connection.
    vi.doMock('@node-singletons/net', () => ({
      connect: vi.fn(() => makeSocket({})),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    RedisDriver.create();

    expect(warn).toHaveBeenCalled();
  });

  it('covers connect timeout path (socket.once missing -> uses socket.on?.)', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { error: loggerError, warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'test',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((k: string, fallback?: number) => {
          if (k === 'REDIS_CONNECT_TIMEOUT_MS') return 1;
          if (k === 'REDIS_COMMAND_TIMEOUT_MS') return 10;
          return fallback ?? 10;
        }),
      },
    }));

    const listeners = new Map<string, Listener>();
    let destroyed = false;

    const socket = makeSocket({
      // once is intentionally missing to hit socket.on?.
      on: (event, cb) => {
        listeners.set(event, cb);
      },
      removeListener: (event, cb) => {
        const current = listeners.get(event);
        if (current === cb) listeners.delete(event);
      },
      setTimeout: (ms) => {
        if (ms > 0) {
          queueMicrotask(() => listeners.get('timeout')?.());
        }
      },
      destroy: () => {
        destroyed = true;
      },
    });

    vi.doMock('@node-singletons/net', () => ({
      connect: vi.fn((_port: number, _host: string, _onConnect: () => void) => socket),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();
    await expect(driver.get('k')).resolves.toBeNull();
    expect(destroyed).toBe(true);
    expect(loggerError).toHaveBeenCalled();
  });

  it('covers unknown connect error (socket.on missing -> uses socket.once?.) and data settleOk', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { error: loggerError, warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'test',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((k: string, fallback?: number) => {
          if (k === 'REDIS_CONNECT_TIMEOUT_MS') return 10;
          if (k === 'REDIS_COMMAND_TIMEOUT_MS') return 10;
          return fallback ?? 10;
        }),
      },
    }));

    const listeners = new Map<string, Listener>();
    const onceListeners = new Map<string, Listener>();

    const socket = makeSocket({
      // on is intentionally missing to hit socket.once?. in listenPreferOn
      once: (event, cb) => {
        onceListeners.set(event, cb);
      },
      removeListener: (event, cb) => {
        const current = onceListeners.get(event) ?? listeners.get(event);
        if (current === cb) {
          onceListeners.delete(event);
          listeners.delete(event);
        }
      },
      setTimeout: (_ms) => void 0,
      write: (_chunk: string) => {
        // Data comes back as a string -> settleOk(data); return;
        const cb = onceListeners.get('data') ?? listeners.get('data');
        cb?.('$12\r\n{"x":true}\r\n');
      },
    });

    const connectMock = vi.fn((_port: number, _host: string, onConnect: () => void) => {
      queueMicrotask(() => onConnect());
      return socket;
    });

    vi.doMock('@node-singletons/net', () => ({ connect: connectMock }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();
    await expect(driver.get('k')).resolves.toEqual({ x: true });

    // Now trigger unknown error path on a new connection attempt.
    vi.resetModules();
    const listeners2 = new Map<string, Listener>();
    const socket2 = makeSocket({
      once: (event, cb) => {
        listeners2.set(event, cb);
      },
      setTimeout: (_ms) => void 0,
    });

    vi.doMock('@config/logger', () => ({ Logger: { error: loggerError, warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'test',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((k: string, fallback?: number) => {
          if (k === 'REDIS_CONNECT_TIMEOUT_MS') return 10;
          if (k === 'REDIS_COMMAND_TIMEOUT_MS') return 10;
          return fallback ?? 10;
        }),
      },
    }));

    vi.doMock('@node-singletons/net', () => ({
      connect: vi.fn((_port: number, _host: string, _onConnect: () => void) => {
        queueMicrotask(() => listeners2.get('error')?.('nope'));
        return socket2;
      }),
    }));

    const { RedisDriver: RedisDriver2 } = await import('@/cache/drivers/RedisDriver');
    const driver2 = RedisDriver2.create();
    await expect(driver2.get('k')).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('covers sendCommand String(data) coercion + socket error branch + TCP method error logging', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { error: loggerError, warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'test',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((k: string, fallback?: number) => {
          if (k === 'REDIS_CONNECT_TIMEOUT_MS') return 10;
          if (k === 'REDIS_COMMAND_TIMEOUT_MS') return 10;
          return fallback ?? 10;
        }),
      },
    }));

    const onMap = new Map<string, Listener>();
    const onceMap = new Map<string, Listener>();

    const socket = makeSocket({
      on: (event, cb) => {
        onMap.set(event, cb);
      },
      once: (event, cb) => {
        onceMap.set(event, cb);
      },
      removeListener: (event, cb) => {
        if (onMap.get(event) === cb) onMap.delete(event);
        if (onceMap.get(event) === cb) onceMap.delete(event);
      },
      setTimeout: (_ms) => void 0,
      write: (chunk: string) => {
        const dataCb = onceMap.get('data') ?? onMap.get('data');
        const errCb = onceMap.get('error') ?? onMap.get('error');

        if (chunk.startsWith('GET ')) {
          // Force onDataUnknown to take the fallback: settleOk(String(data))
          dataCb?.({ toString: null });
          return;
        }

        // For non-GET commands, trigger socket error (non-Error) to cover ErrorFactory branch.
        errCb?.('socket-broke');
      },
    });

    vi.doMock('@node-singletons/net', () => ({
      connect: vi.fn((_port: number, _host: string, onConnect: () => void) => {
        queueMicrotask(() => onConnect());
        return socket;
      }),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    // GET: sendCommand resolves with String(data) and then JSON.parse fails -> logs GET failed
    await expect(driver.get('k')).resolves.toBeNull();

    // SET/DEL/FLUSHDB/EXISTS: sendCommand rejects -> catch blocks log errors and swallow
    await expect(driver.set('k', { a: 1 }, 60)).resolves.toBeUndefined();
    await expect(driver.delete('k')).resolves.toBeUndefined();
    await expect(driver.clear()).resolves.toBeUndefined();
    await expect(driver.has('k')).resolves.toBe(false);

    expect(loggerError).toHaveBeenCalled();
  });

  it('covers sendCommand Error branch and command timeout settleErr', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { error: loggerError, warn: vi.fn() } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'test',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((k: string, fallback?: number) => {
          if (k === 'REDIS_CONNECT_TIMEOUT_MS') return 10;
          if (k === 'REDIS_COMMAND_TIMEOUT_MS') return 1;
          return fallback ?? 10;
        }),
      },
    }));

    const onMap = new Map<string, Listener>();
    const onceMap = new Map<string, Listener>();

    const socket = makeSocket({
      on: (event, cb) => onMap.set(event, cb),
      once: (event, cb) => onceMap.set(event, cb),
      removeListener: (event, cb) => {
        if (onMap.get(event) === cb) onMap.delete(event);
        if (onceMap.get(event) === cb) onceMap.delete(event);
      },
      setTimeout: (_ms) => void 0,
      write: (chunk: string) => {
        const errCb = onceMap.get('error') ?? onMap.get('error');
        const timeoutCb = onceMap.get('timeout') ?? onMap.get('timeout');

        if (chunk.startsWith('GET ')) {
          queueMicrotask(() => timeoutCb?.());
          return;
        }

        queueMicrotask(() => errCb?.(new Error('boom')));
      },
    });

    vi.doMock('@node-singletons/net', () => ({
      connect: vi.fn((_port: number, _host: string, onConnect: () => void) => {
        queueMicrotask(() => onConnect());
        return socket;
      }),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    // Error-instance path in onErrorUnknown (sendCommand)
    await expect(driver.set('k', { a: 1 }, 60)).resolves.toBeUndefined();

    // Command timeout path in sendCommand
    await expect(driver.get('k')).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });
});
