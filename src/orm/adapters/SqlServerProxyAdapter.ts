/* eslint-disable @typescript-eslint/require-await */
/**
 * SQL Server Proxy Adapter (HTTP)
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import type { IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import {
  ensureSignedSettings,
  isRecord,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';
import { SqlProxyHttpAdapterShared, type ProxyMode } from '@orm/adapters/SqlProxyHttpAdapterShared';
import {
  createStatementPayload,
  getExecMetaWithLastRowId,
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

const resolveProxyMode = (): ProxyMode => {
  return SqlProxyHttpAdapterShared.resolveProxyModeFromEnv('SQLSERVER_PROXY_MODE');
};

const buildProxySettings = (): ProxySettings => {
  return SqlProxyHttpAdapterShared.buildProxySettingsFromEnv({
    urlKey: 'SQLSERVER_PROXY_URL',
    hostKey: 'SQLSERVER_PROXY_HOST',
    portKey: 'SQLSERVER_PROXY_PORT',
    defaultHost: '127.0.0.1',
    defaultPort: 8793,
    keyIdKey: 'SQLSERVER_PROXY_KEY_ID',
    secretKey: 'SQLSERVER_PROXY_SECRET',
    timeoutKey: 'SQLSERVER_PROXY_TIMEOUT_MS',
    sharedTimeoutKey: 'ZT_PROXY_TIMEOUT_MS',
    customHeadersPrefix: 'SQLSERVER',
  });
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => {
  return SqlProxyHttpAdapterShared.buildStandardSignedProxyConfig({
    settings,
    label: 'SQL Server',
    urlKey: 'SQLSERVER_PROXY_URL',
    keyIdKey: 'SQLSERVER_PROXY_KEY_ID',
    secretKey: 'SQLSERVER_PROXY_SECRET',
  });
};

const isQueryResponse = (value: unknown): value is ProxyQueryResponse =>
  isRecord(value) && Array.isArray(value['rows']) && typeof value['rowCount'] === 'number';

const isQueryOneResponse = (value: unknown): value is ProxyQueryOneResponse =>
  isRecord(value) && 'row' in value;

const requestProxy = async <T>(
  signed: SignedProxyConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => SqlProxyHttpAdapterShared.requestProxy<T>(signed, path, payload);

type SqlServerProxyState = {
  connected: boolean;
  inTransaction: boolean;
  settings: ProxySettings;
  signed: SignedProxyConfig;
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
            state.signed,
            '/zin/sqlserver/statement',
            await createStatementPayload(sql, parameters)
          )
        : await requestProxy<ProxyStatementResponse>(state.signed, '/zin/sqlserver/query', {
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
        state.signed,
        '/zin/sqlserver/queryOne',
        {
          sql,
          params: parameters,
        }
      );
      return out.row ?? null;
    }

    const out = await requestProxy<ProxyStatementResponse>(
      state.signed,
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
      ensureSignedSettings(state.signed);
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

    async ensureMigrationsTable(): Promise<void> {
      requireConnected(state);
      try {
        await query(
          `IF OBJECT_ID(N'migrations', N'U') IS NULL
BEGIN
  CREATE TABLE migrations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    scope NVARCHAR(255) NOT NULL DEFAULT 'global',
    service NVARCHAR(255) NOT NULL DEFAULT '',
    batch INT NOT NULL,
    status NVARCHAR(255) NOT NULL,
    applied_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_migrations_name_scope_service UNIQUE (name, scope, service)
  );
END`,
          []
        );
      } catch (error) {
        throw SqlProxyHttpAdapterShared.createProxyNotReachableCliError(
          'SQL Server proxy',
          state.settings.baseUrl,
          error
        );
      }
    },

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
  const signed = buildSignedProxyConfig(settings);
  const state: SqlServerProxyState = { connected: false, inTransaction: false, settings, signed };
  return createAdapter(state);
}
