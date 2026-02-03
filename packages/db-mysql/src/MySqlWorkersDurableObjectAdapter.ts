import { ErrorFactory, Logger } from '@zintrust/core';
import { CREATE_MIGRATIONS_TABLE_SQL, MYSQL_PLACEHOLDER, MYSQL_TYPE } from './common.js';
import type { IDatabaseAdapter, QueryResult } from './index.js';

type DurableObjectNamespace = {
  idFromName: (name: string) => { toString: () => string };
  get: (id: unknown) => DurableObjectStub;
};

type DurableObjectStub = {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
};

const createSendQueryFunction = (
  getStub: () => DurableObjectStub,
  connect: () => Promise<void>
) => {
  return async (
    sql: string,
    params: unknown[],
    method: 'query' | 'execute'
  ): Promise<QueryResult> => {
    await connect();
    const stub = getStub();

    const response = await stub.fetch('http://do/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
        method,
      }),
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
      throw ErrorFactory.createGeneralError(`DO Query Failed: ${msg}`);
    }

    return (await response.json()) as QueryResult;
  };
};

const createConnectionManager = (
  getNamespace: () => DurableObjectNamespace | undefined
): {
  connect: () => Promise<void>;
  sendQuery: (sql: string, params: unknown[], method: 'query' | 'execute') => Promise<QueryResult>;
  disconnect: () => void;
  isConnected: () => boolean;
} => {
  let connected = false;

  const getStub = (): DurableObjectStub => {
    const namespace = getNamespace();
    if (!namespace) {
      throw ErrorFactory.createConfigError(
        'MYSQL_POOL binding not found. Cannot connect to Durable Object pool.'
      );
    }

    const id = namespace.idFromName('default');
    return namespace.get(id);
  };

  const connect = async (): Promise<void> => {
    if (connected) return;

    try {
      const stub = getStub();
      const res = await stub.fetch('http://do/health', {
        method: 'POST',
      });

      if (!res.ok) {
        throw ErrorFactory.createGeneralError(`DO health check failed: ${res.status}`);
      }

      const body = (await res.json()) as { connected: boolean };
      if (!body.connected) {
        Logger.info(
          '[MySqlWorkersDurableObjectAdapter] DO not connected yet, will init on first query'
        );
      }

      connected = true;
    } catch (err: unknown) {
      Logger.error('[MySqlWorkersDurableObjectAdapter] Connection failed', err);
      throw ErrorFactory.createGeneralError('Failed to connect to MySQL DO', err);
    }
  };

  const sendQuery = createSendQueryFunction(getStub, connect);

  return {
    connect,
    sendQuery,
    disconnect: (): void => {
      connected = false;
    },
    isConnected: (): boolean => connected,
  };
};

export const MySqlWorkersDurableObjectAdapter = Object.freeze({
  create(_config: unknown): IDatabaseAdapter {
    const connectionManager = createConnectionManager(() => {
      const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
      return globalEnv?.['MYSQL_POOL'] as DurableObjectNamespace | undefined;
    });

    return {
      async connect(): Promise<void> {
        return connectionManager.connect();
      },

      async disconnect(): Promise<void> {
        connectionManager.disconnect();
      },

      async query(sql: string, parameters: unknown[] = []): Promise<QueryResult> {
        return connectionManager.sendQuery(sql, parameters, 'query');
      },

      async queryOne(
        sql: string,
        parameters: unknown[] = []
      ): Promise<Record<string, unknown> | null> {
        const result = await connectionManager.sendQuery(sql, parameters, 'query');
        if (result.rows.length === 0) return null;
        return result.rows[0];
      },

      async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
        const result = await connectionManager.sendQuery(sql, parameters || [], 'query');
        return result.rows as T[];
      },

      async ping(): Promise<void> {
        await connectionManager.connect();
        await connectionManager.sendQuery('SELECT 1', [], 'query');
      },

      async transaction<T>(_callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        throw ErrorFactory.createGeneralError(
          'Transactions are not yet supported in MySqlWorkersDurableObjectAdapter'
        );
      },

      getType(): string {
        return MYSQL_TYPE;
      },

      isConnected(): boolean {
        return connectionManager.isConnected();
      },

      getPlaceholder(_index: number): string {
        return MYSQL_PLACEHOLDER;
      },

      async ensureMigrationsTable(): Promise<void> {
        await connectionManager.sendQuery(CREATE_MIGRATIONS_TABLE_SQL, [], 'query');
      },
    };
  },
});
