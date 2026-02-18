/**
 * Redis Cache Driver
 * Zero-dependency implementation using Node.js native net module
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { createRedisConnection } from '@config/workers';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as net from '@node-singletons/net';
import { RedisKeys } from '@tools/redis/RedisKeyManager';

type RedisClientLike = {
  get: (key: string) => Promise<string | null>;
  set: (...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<unknown>;
  flushdb: () => Promise<unknown>;
  exists: (...keys: string[]) => Promise<number>;
};

type SocketListener = (...args: unknown[]) => void;

type SocketLike = {
  destroyed?: boolean;
  setTimeout?: (ms: number) => void;
  removeListener?: (event: string, cb: SocketListener) => void;
  once?: (event: string, cb: SocketListener) => void;
  on?: (event: string, cb: SocketListener) => void;
  write?: (chunk: string) => void;
  destroy?: () => void;
};

const listenPreferOnce = (socket: SocketLike, event: string, cb: SocketListener): void => {
  if (typeof socket.once === 'function') {
    socket.once(event, cb);
    return;
  }
  socket.on?.(event, cb);
};

const listenPreferOn = (socket: SocketLike, event: string, cb: SocketListener): void => {
  if (typeof socket.on === 'function') {
    socket.on(event, cb);
    return;
  }
  socket.once?.(event, cb);
};

const hasToString = (value: unknown): value is { toString: () => string } => {
  if (value === null || value === undefined) return false;
  return typeof (value as { toString?: unknown }).toString === 'function';
};

const createIoredisClient = (params: {
  isWorkersRuntime: boolean;
  wantsProxy: boolean;
}): RedisClientLike | null => {
  if (String(Env.NODE_ENV ?? '').startsWith('test')) return null;
  try {
    const db = Env.getInt('REDIS_CACHE_DB', Env.getInt('REDIS_QUEUE_DB', 0));
    const client = createRedisConnection(
      {
        host: Env.REDIS_HOST,
        port: Env.REDIS_PORT,
        password: Env.get('REDIS_PASSWORD', ''),
        db,
      },
      3
    ) as unknown as RedisClientLike;

    return client !== null && typeof client.get === 'function' ? client : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (params.isWorkersRuntime || params.wantsProxy) {
      Logger.error('Redis cache driver initialization failed', { error: msg });
      throw error;
    }

    Logger.warn('Redis cache driver falling back to TCP socket implementation', {
      error: msg,
    });
    return null;
  }
};

const createCacheDriverFromIoredisClient = (client: RedisClientLike): CacheDriver => ({
  async get<T>(key: string): Promise<T | null> {
    try {
      const prefixedKey = RedisKeys.createCacheKey(key);
      const value = await client.get(prefixedKey);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      Logger.error('Redis GET failed', error);
      return null;
    }
  },

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const prefixedKey = RedisKeys.createCacheKey(key);
      const jsonValue = JSON.stringify(value);
      if (ttl === undefined) {
        await client.set(prefixedKey, jsonValue);
        return;
      }
      await client.set(prefixedKey, jsonValue, 'EX', ttl);
    } catch (error) {
      Logger.error('Redis SET failed', error);
    }
  },

  async delete(key: string): Promise<void> {
    try {
      const prefixedKey = RedisKeys.createCacheKey(key);
      await client.del(prefixedKey);
    } catch (error) {
      Logger.error('Redis DEL failed', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await client.flushdb();
    } catch (error) {
      Logger.error('Redis FLUSHDB failed', error);
    }
  },

  async has(key: string): Promise<boolean> {
    try {
      const prefixedKey = RedisKeys.createCacheKey(key);
      const out = await client.exists(prefixedKey);
      return out > 0;
    } catch (error) {
      Logger.error('Redis EXISTS failed', error);
      return false;
    }
  },
});

const createIoredisCacheDriver = (params: {
  isWorkersRuntime: boolean;
  wantsProxy: boolean;
}): CacheDriver | null => {
  const client = createIoredisClient(params);
  return client === null ? null : createCacheDriverFromIoredisClient(client);
};

const createTcpConnect = (params: {
  host: string;
  port: number;
  connectTimeoutMs: number;
}): (() => Promise<net.Socket>) => {
  let client: net.Socket | null = null;

  return async (): Promise<net.Socket> => {
    if (client && !client.destroyed) return client;

    return new Promise((resolve, reject) => {
      const onTimeout = (): void => {
        cleanup();
        try {
          (socket as unknown as SocketLike).destroy?.();
        } catch {
          /* ignore */
        }
        reject(
          ErrorFactory.createConnectionError('Redis connection timeout', {
            host: params.host,
            port: params.port,
            timeoutMs: params.connectTimeoutMs,
          })
        );
      };

      const onError = (err: Error): void => {
        cleanup();
        Logger.error(`Redis Connection Error: ${err.message}`);
        reject(err);
      };

      const onErrorUnknown: SocketListener = (err) => {
        if (err instanceof Error) {
          onError(err);
          return;
        }

        cleanup();
        const msg = String(err);
        Logger.error(`Redis Connection Error: ${msg}`);
        reject(
          ErrorFactory.createConnectionError(`Redis Connection Error: ${msg}`, {
            error: msg,
          })
        );
      };

      const onConnect = (): void => {
        cleanup();
        client = socket;
        resolve(socket);
      };

      const socket = net.connect(params.port, params.host, onConnect);

      const anySocket = socket as unknown as SocketLike;

      const cleanup = (): void => {
        anySocket.setTimeout?.(0);
        anySocket.removeListener?.('timeout', onTimeout);
        anySocket.removeListener?.('error', onErrorUnknown);
      };

      anySocket.setTimeout?.(Math.max(1, params.connectTimeoutMs));
      listenPreferOnce(anySocket, 'timeout', onTimeout);
      listenPreferOn(anySocket, 'error', onErrorUnknown);
    });
  };
};

const createTcpSendCommand = (params: {
  connect: () => Promise<net.Socket>;
  commandTimeoutMs: number;
}): ((command: string) => Promise<string>) => {
  return async (command: string): Promise<string> => {
    const socket = await params.connect();

    const anySocket = socket as unknown as SocketLike;

    return new Promise((resolve, reject) => {
      let settled = false;

      const onDataUnknown: SocketListener = (data) => {
        if (typeof data === 'string') {
          settleOk(data);
          return;
        }

        if (hasToString(data)) {
          settleOk(data.toString());
          return;
        }
        settleOk(String(data));
      };

      const onErrorUnknown: SocketListener = (err) => {
        settleErr(
          err instanceof Error
            ? err
            : ErrorFactory.createConnectionError('Redis socket error', {
                error: String(err),
              })
        );
      };

      const cleanup = (): void => {
        anySocket.setTimeout?.(0);
        anySocket.removeListener?.('data', onDataUnknown);
        anySocket.removeListener?.('error', onErrorUnknown);
        anySocket.removeListener?.('timeout', onTimeout);
      };

      const settleOk = (value: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleErr = (err: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onTimeout = (): void =>
        settleErr(
          ErrorFactory.createConnectionError('Redis command timeout', {
            timeoutMs: params.commandTimeoutMs,
          })
        );

      anySocket.setTimeout?.(Math.max(1, params.commandTimeoutMs));
      listenPreferOnce(anySocket, 'data', onDataUnknown);
      listenPreferOnce(anySocket, 'timeout', onTimeout);
      listenPreferOn(anySocket, 'error', onErrorUnknown);
      anySocket.write?.(command);
    });
  };
};

const createTcpCacheDriver = (): CacheDriver => {
  const host = Env.REDIS_HOST;
  const port = Env.REDIS_PORT;
  const connectTimeoutMs = Env.getInt('REDIS_CONNECT_TIMEOUT_MS', 5_000);
  const commandTimeoutMs = Env.getInt('REDIS_COMMAND_TIMEOUT_MS', 5_000);

  const connect = createTcpConnect({ host, port, connectTimeoutMs });
  const sendCommand = createTcpSendCommand({ connect, commandTimeoutMs });

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const prefixedKey = RedisKeys.createCacheKey(key);
        const response = await sendCommand(`GET ${prefixedKey}\r\n`);
        if (response.startsWith('$-1')) return null;

        const lines = response.split('\r\n');
        const value = lines[1];
        return JSON.parse(value) as T;
      } catch (error) {
        Logger.error('Redis GET failed', error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      try {
        const prefixedKey = RedisKeys.createCacheKey(key);
        const jsonValue = JSON.stringify(value);
        const command =
          ttl === undefined
            ? `SET ${prefixedKey} ${jsonValue}\r\n`
            : `SETEX ${prefixedKey} ${ttl} ${jsonValue}\r\n`;
        await sendCommand(command);
      } catch (error) {
        Logger.error('Redis SET failed', error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        const prefixedKey = RedisKeys.createCacheKey(key);
        await sendCommand(`DEL ${prefixedKey}\r\n`);
      } catch (error) {
        Logger.error('Redis DEL failed', error);
      }
    },

    async clear(): Promise<void> {
      try {
        await sendCommand(`FLUSHDB\r\n`);
      } catch (error) {
        Logger.error('Redis FLUSHDB failed', error);
      }
    },

    async has(key: string): Promise<boolean> {
      try {
        const prefixedKey = RedisKeys.createCacheKey(key);
        const response = await sendCommand(`EXISTS ${prefixedKey}\r\n`);
        return response.includes(':1');
      } catch (error) {
        Logger.error('Redis EXISTS failed', error);
        return false;
      }
    },
  };
};

/**
 * Create a new Redis driver instance
 */
const create = (): CacheDriver => {
  const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;
  const wantsProxy =
    Env.USE_REDIS_PROXY === true || (Env.get('REDIS_PROXY_URL', '') || '').trim() !== '';
  const ioredisDriver = createIoredisCacheDriver({ isWorkersRuntime, wantsProxy });
  return ioredisDriver ?? createTcpCacheDriver();
};

/**
 * RedisDriver namespace - sealed for immutability
 */
export const RedisDriver = Object.freeze({
  create,
});
