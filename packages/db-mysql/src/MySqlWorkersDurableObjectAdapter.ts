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

const getDoTimeoutMs = (): number => {
  const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
  const raw = globalEnv?.['MYSQL_DO_TIMEOUT_MS'] ?? globalEnv?.['DO_REQUEST_TIMEOUT_MS'];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
};

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(timeoutMs) : undefined;
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
    const executePath = 'http://do/execute'; //NOSONAR
    const queryPath = 'http://do/query'; //NOSONAR
    const payload = JSON.stringify({
      command: sql,
      sql,
      params,
      method,
    });
    const timeoutMs = getDoTimeoutMs();

    const send = async (path: string): Promise<Response> => {
      const startedAt = Date.now();
      try {
        const response = await stub.fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
          signal: createTimeoutSignal(timeoutMs),
        });

        Logger.debug('[MySqlWorkersDurableObjectAdapter] DO request completed', {
          path,
          status: response.status,
          durationMs: Date.now() - startedAt,
          timeoutMs,
          sqlPreview: sql.slice(0, 80),
        });

        return response;
      } catch (error: unknown) {
        Logger.error('[MySqlWorkersDurableObjectAdapter] DO request failed', {
          path,
          durationMs: Date.now() - startedAt,
          timeoutMs,
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.name === 'AbortError') {
          throw ErrorFactory.createGeneralError(
            `MySQL DO request timed out after ${timeoutMs}ms (${path})`,
            error
          );
        }

        throw error;
      }
    };

    let response = await send(executePath);
    if (!response.ok && (response.status === 404 || response.status === 405)) {
      response = await send(queryPath);
    }

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

    const json = (await response.json()) as unknown;
    if (json !== null && typeof json === 'object' && 'result' in (json as { result?: unknown })) {
      return (json as { result: QueryResult }).result;
    }
    return json as QueryResult;
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
      const health = 'http://do/health'; //NOSONAR
      const timeoutMs = getDoTimeoutMs();
      const res = await stub.fetch(health, {
        method: 'POST',
        signal: createTimeoutSignal(timeoutMs),
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
