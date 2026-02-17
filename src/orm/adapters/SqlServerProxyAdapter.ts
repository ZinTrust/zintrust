/* eslint-disable @typescript-eslint/require-await */
/**
 * SQL Server Proxy Adapter (HTTP)
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import type { IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import {
  ensureSignedSettings,
  isRecord,
  requestSignedProxy,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';
import {
  createStatementPayload,
  getExecMetaWithLastRowId,
  resolveSqlProxyMode,
} from '@orm/adapters/SqlProxyRegistryMode';

type ProxyQueryResponse = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

type ProxyQueryOneResponse = {
  row: Record<string, unknown> | null;
};

type ProxyExecResponse = {
  ok: boolean;
  meta?: { changes?: number; lastRowId?: number | string | bigint };
};

type ProxyStatementResponse = ProxyQueryResponse | ProxyQueryOneResponse | ProxyExecResponse;

type ProxyMode = 'sql' | 'registry';

const resolveProxyMode = (): ProxyMode => {
  return resolveSqlProxyMode('SQLSERVER_PROXY_MODE');
};

const resolveBaseUrl = (): string => {
  const explicit = Env.get('SQLSERVER_PROXY_URL', '').trim();
  if (explicit !== '') return explicit;
  const host = Env.get('SQLSERVER_PROXY_HOST', '127.0.0.1');
  const port = Env.getInt('SQLSERVER_PROXY_PORT', 8793);
  return `http://${host}:${port}`;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = resolveBaseUrl();
  const keyId = Env.get('SQLSERVER_PROXY_KEY_ID', '');
  const secret = Env.get('SQLSERVER_PROXY_SECRET', '');
  const timeoutMs = Env.getInt('SQLSERVER_PROXY_TIMEOUT_MS', Env.ZT_PROXY_TIMEOUT_MS ?? 30000);

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => ({
  settings,
  missingUrlMessage: 'SQL Server proxy URL is missing (SQLSERVER_PROXY_URL)',
  missingCredentialsMessage:
    'SQL Server proxy signing credentials are missing (SQLSERVER_PROXY_KEY_ID / SQLSERVER_PROXY_SECRET)',
  messages: {
    unauthorized: 'SQL Server proxy unauthorized',
    forbidden: 'SQL Server proxy forbidden',
    rateLimited: 'SQL Server proxy rate limited',
    rejected: 'SQL Server proxy rejected request',
    error: 'SQL Server proxy error',
    timedOut: 'SQL Server proxy request timed out',
  },
});

const isQueryResponse = (value: unknown): value is ProxyQueryResponse =>
  isRecord(value) && Array.isArray(value['rows']) && typeof value['rowCount'] === 'number';

const isQueryOneResponse = (value: unknown): value is ProxyQueryOneResponse =>
  isRecord(value) && 'row' in value;

const requestProxy = async <T>(
  settings: ProxySettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => requestSignedProxy<T>(buildSignedProxyConfig(settings), path, payload);

type SqlServerProxyState = {
  connected: boolean;
  inTransaction: boolean;
  settings: ProxySettings;
};

const requireConnected = (state: SqlServerProxyState): void => {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
};

const toQueryResult = (out: ProxyStatementResponse): QueryResult => {
  if (isQueryResponse(out)) {
    return { rows: out.rows, rowCount: out.rowCount };
  }

  if (isQueryOneResponse(out)) {
    const row = out.row ?? null;
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  const meta = getExecMetaWithLastRowId(out);
  return { rows: [], rowCount: meta.changes, lastInsertId: meta.lastRowId };
};

const createQuery =
  (state: SqlServerProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<QueryResult> => {
    requireConnected(state);

    const mode = resolveProxyMode();
    const out =
      mode === 'registry'
        ? await requestProxy<ProxyStatementResponse>(
            state.settings,
            '/zin/sqlserver/statement',
            await createStatementPayload(sql, parameters)
          )
        : await requestProxy<ProxyStatementResponse>(state.settings, '/zin/sqlserver/query', {
            sql,
            params: parameters,
          });

    return toQueryResult(out);
  };

const createQueryOne =
  (state: SqlServerProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> => {
    requireConnected(state);

    const mode = resolveProxyMode();
    if (mode !== 'registry') {
      const out = await requestProxy<ProxyQueryOneResponse>(
        state.settings,
        '/zin/sqlserver/queryOne',
        {
          sql,
          params: parameters,
        }
      );
      return out.row ?? null;
    }

    const out = await requestProxy<ProxyStatementResponse>(
      state.settings,
      '/zin/sqlserver/statement',
      await createStatementPayload(sql, parameters)
    );

    if (isQueryOneResponse(out)) return out.row ?? null;
    if (isQueryResponse(out)) return out.rows[0] ?? null;
    return null;
  };

const createPing =
  (query: (sql: string, parameters: unknown[]) => Promise<QueryResult>) =>
  async (): Promise<void> => {
    await query(QueryBuilder.create('').select('1').toSQL(), []);
  };

const createTransaction =
  (state: SqlServerProxyState, getAdapter: () => IDatabaseAdapter) =>
  async <T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> => {
    if (state.inTransaction) {
      throw ErrorFactory.createGeneralError('Transaction already in progress');
    }

    requireConnected(state);
    state.inTransaction = true;
    try {
      const adapter = getAdapter();
      await adapter.query('BEGIN TRANSACTION', []);
      const result = await callback(adapter);
      await adapter.query('COMMIT', []);
      return result;
    } catch (error) {
      try {
        await getAdapter().query('ROLLBACK', []);
      } catch {
        void 0;
      }
      throw error;
    } finally {
      state.inTransaction = false;
    }
  };

const createRawQuery =
  (query: (sql: string, parameters: unknown[]) => Promise<QueryResult>) =>
  async <T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> => {
    const result = await query(sql, parameters ?? []);
    return result.rows as T[];
  };

const createAdapter = (state: SqlServerProxyState): IDatabaseAdapter => {
  const query = createQuery(state);
  const queryOne = createQueryOne(state);

  const adapter: IDatabaseAdapter = {
    async connect(): Promise<void> {
      ensureSignedSettings(buildSignedProxyConfig(state.settings));
      state.connected = true;
    },

    async disconnect(): Promise<void> {
      state.connected = false;
      state.inTransaction = false;
    },

    query,
    queryOne,
    ping: createPing(query),
    transaction: createTransaction(state, () => adapter),
    rawQuery: createRawQuery(query),

    getType(): SupportedDriver {
      return AdaptersEnum.sqlserver;
    },

    isConnected(): boolean {
      return state.connected;
    },

    getPlaceholder(index: number): string {
      return `@param${index}`;
    },
  };

  return adapter;
};

export function createSqlServerProxyAdapter(): IDatabaseAdapter {
  const settings = buildProxySettings();
  const state: SqlServerProxyState = { connected: false, inTransaction: false, settings };
  return createAdapter(state);
}
