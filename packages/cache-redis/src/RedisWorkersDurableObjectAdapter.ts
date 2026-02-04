import { ErrorFactory, Logger } from '@zintrust/core';
import type { CacheDriver } from './index.js';

type DurableObjectNamespace = {
  idFromName: (name: string) => { toString: () => string };
  get: (id: unknown) => DurableObjectStub;
};

type DurableObjectStub = {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
};

const createSendCommandFunction = (
  getStub: () => DurableObjectStub,
  connect: () => Promise<void>
) => {
  return async (command: string, args: unknown[]): Promise<unknown> => {
    await connect();
    const stub = getStub();
    const executePath = 'http://do/execute'; //NOSONAR
    const payload = JSON.stringify({
      command,
      params: args,
    });

    const response = await stub.fetch(executePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (!response.ok) {
      const text = await response.text();
      let errDetail: unknown;
      try {
        errDetail = JSON.parse(text);
      } catch {
        errDetail = { error: text };
      }
      const msg =
        (errDetail as { error?: string; message?: string }).error ||
        (errDetail as { error?: string; message?: string }).message ||
        response.statusText;
      throw ErrorFactory.createGeneralError(`DO Command Failed: ${msg}`);
    }

    const json = (await response.json()) as unknown;
    if (json !== null && typeof json === 'object' && 'result' in (json as { result?: unknown })) {
      return (json as { result: unknown }).result;
    }
    return json as unknown;
  };
};

const createConnectionManager = (
  getNamespace: () => DurableObjectNamespace | undefined
): {
  connect: () => Promise<void>;
  sendCommand: (command: string, args: unknown[]) => Promise<unknown>;
  disconnect: () => void;
  isConnected: () => boolean;
} => {
  let connected = false;

  const getStub = (): DurableObjectStub => {
    const namespace = getNamespace();
    if (!namespace) {
      throw ErrorFactory.createConfigError(
        'REDIS_POOL binding not found. Cannot connect to Durable Object pool.'
      );
    }

    const id = namespace.idFromName('default');
    return namespace.get(id);
  };

  const connect = async (): Promise<void> => {
    if (connected) return;

    try {
      const stub = getStub();
      const health = 'http://do/health'; //NOSONAR
      const res = await stub.fetch(health, {
        method: 'POST',
      });

      if (!res.ok) {
        throw ErrorFactory.createGeneralError(`DO health check failed: ${res.status}`);
      }

      const body = (await res.json()) as { connected: boolean };
      if (!body.connected) {
        Logger.info(
          '[RedisWorkersDurableObjectAdapter] DO not connected yet, will init on first command'
        );
      }

      connected = true;
    } catch (err: unknown) {
      Logger.error('[RedisWorkersDurableObjectAdapter] Connection failed', err);
      throw ErrorFactory.createGeneralError('Failed to connect to Redis DO', err);
    }
  };

  const sendCommand = createSendCommandFunction(getStub, connect);

  return {
    connect,
    sendCommand,
    disconnect: (): void => {
      connected = false;
    },
    isConnected: (): boolean => connected,
  };
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const RedisWorkersDurableObjectAdapter = Object.freeze({
  create(): CacheDriver {
    const connectionManager = createConnectionManager(() => {
      const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
      return globalEnv?.['REDIS_POOL'] as DurableObjectNamespace | undefined;
    });

    return {
      async get<T>(key: string): Promise<T | null> {
        const raw = await connectionManager.sendCommand('GET', [key]);
        if (raw === null || raw === undefined) return null;
        try {
          return JSON.parse(String(raw)) as T;
        } catch {
          return null;
        }
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const json = JSON.stringify(value);
        if (Number.isFinite(ttl) && (ttl ?? 0) > 0) {
          await connectionManager.sendCommand('SET', [key, json, 'EX', ttl]);
        } else {
          await connectionManager.sendCommand('SET', [key, json]);
        }
      },

      async delete(key: string): Promise<void> {
        await connectionManager.sendCommand('DEL', [key]);
      },

      async clear(): Promise<void> {
        await connectionManager.sendCommand('FLUSHDB', []);
      },

      async has(key: string): Promise<boolean> {
        const count = await connectionManager.sendCommand('EXISTS', [key]);
        return toNumber(count) > 0;
      },
    };
  },
});

export default RedisWorkersDurableObjectAdapter;
