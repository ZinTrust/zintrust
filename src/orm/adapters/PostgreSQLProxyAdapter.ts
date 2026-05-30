/* eslint-disable @typescript-eslint/require-await */
/**
 * PostgreSQL Proxy Adapter (HTTP)
 *
 * Used in Cloudflare Workers when POSTGRES_PROXY_URL is configured.
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import {
  isRecord,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';
import { SqlProxyHttpAdapterShared, type ProxyMode } from '@orm/adapters/SqlProxyHttpAdapterShared';
import { createStatementPayload } from '@orm/adapters/SqlProxyRegistryMode';
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

type ProxyQueryResponse = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

type ProxyQueryOneResponse = {
  row: Record<string, unknown> | null;
};

type ProxyExecResponse = {
  ok: boolean;
  meta?: { changes?: number };
};

type ProxyStatementResponse = ProxyQueryResponse | ProxyQueryOneResponse | ProxyExecResponse;

const buildProxySettings = (): ProxySettings => {
  return SqlProxyHttpAdapterShared.buildProxySettingsFromEnv({
    urlKey: 'POSTGRES_PROXY_URL',
    hostKey: 'POSTGRES_PROXY_HOST',
    portKey: 'POSTGRES_PROXY_PORT',
    defaultHost: '127.0.0.1',
    defaultPort: 8790,
    keyIdKey: 'POSTGRES_PROXY_KEY_ID',
    secretKey: 'POSTGRES_PROXY_SECRET',
    timeoutKey: 'POSTGRES_PROXY_TIMEOUT_MS',
    sharedKeyIdKey: 'ZT_PROXY_KEY_ID',
    sharedSecretKey: 'ZT_PROXY_SECRET',
    sharedTimeoutKey: 'ZT_PROXY_TIMEOUT_MS',
    customHeadersPrefix: 'POSTGRES',
  });
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => {
  return SqlProxyHttpAdapterShared.buildStandardSignedProxyConfig({
    settings,
    label: 'PostgreSQL',
    urlKey: 'POSTGRES_PROXY_URL',
    keyIdKey: 'POSTGRES_PROXY_KEY_ID',
    secretKey: 'POSTGRES_PROXY_SECRET',
  });
};

const isQueryResponse = (value: unknown): value is ProxyQueryResponse =>
  isRecord(value) && Array.isArray(value['rows']) && typeof value['rowCount'] === 'number';

const isQueryOneResponse = (value: unknown): value is ProxyQueryOneResponse =>
  isRecord(value) && 'row' in value;

const normalizeLastInsertId = (value: unknown): string | number | bigint | undefined => {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return value;
  }
  return undefined;
};

const extractRowId = (row: unknown): string | number | bigint | undefined => {
  if (!isRecord(row)) return undefined;
  return normalizeLastInsertId(row['id']);
};

const getExecMeta = (value: unknown): { changes: number } => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return { changes: 0 };
  const meta = value['meta'];
  if (!isRecord(meta)) return { changes: 0 };
  const changes = typeof meta['changes'] === 'number' ? meta['changes'] : 0;
  return { changes };
};

const toQueryResult = (out: ProxyStatementResponse): QueryResult => {
  if (isQueryResponse(out)) {
    return {
      rows: out.rows,
      rowCount: out.rowCount,
      lastInsertId: extractRowId(out.rows[0]),
    };
  }

  if (isQueryOneResponse(out)) {
    const row = out.row ?? null;
    return {
      rows: row ? [row] : [],
      rowCount: row ? 1 : 0,
      lastInsertId: extractRowId(row),
    };
  }

  const meta = getExecMeta(out);
  return { rows: [], rowCount: meta.changes };
};

const resolveProxyMode = (): ProxyMode => {
  return SqlProxyHttpAdapterShared.resolveProxyModeFromEnv('POSTGRES_PROXY_MODE');
};

type PostgresProxyState = {
  connected: boolean;
  settings: ProxySettings;
  signed: SignedProxyConfig;
};

const requireConnected = (state: PostgresProxyState): void => {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
};

const createQuery =
  (state: PostgresProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<QueryResult> => {
    requireConnected(state);
    const mode = resolveProxyMode();
    const out =
      mode === 'registry'
        ? await SqlProxyHttpAdapterShared.requestProxy<ProxyStatementResponse>(
            state.signed,
            '/zin/postgres/statement',
            await createStatementPayload(sql, parameters)
          )
        : await SqlProxyHttpAdapterShared.requestProxy<ProxyStatementResponse>(
            state.signed,
            '/zin/postgres/query',
            {
              sql,
              params: parameters,
            }
          );
    return toQueryResult(out);
  };

const createQueryOne =
  (state: PostgresProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> => {
    requireConnected(state);
    const mode = resolveProxyMode();
    if (mode !== 'registry') {
      const out = await SqlProxyHttpAdapterShared.requestProxy<ProxyQueryOneResponse>(
        state.signed,
        '/zin/postgres/queryOne',
        {
          sql,
          params: parameters,
        }
      );
      return out.row ?? null;
    }

    const out = await SqlProxyHttpAdapterShared.requestProxy<ProxyStatementResponse>(
      state.signed,
      '/zin/postgres/statement',
      await createStatementPayload(sql, parameters)
    );

    if (isQueryOneResponse(out)) return out.row ?? null;
    if (isQueryResponse(out)) return out.rows[0] ?? null;
    return null;
  };

const createPing =
  (queryOne: (sql: string, parameters: unknown[]) => Promise<Record<string, unknown> | null>) =>
  async (): Promise<void> => {
    await queryOne(QueryBuilder.create('').select('1').toSQL(), []);
  };

const createTransaction =
  (state: PostgresProxyState, getAdapter: () => IDatabaseAdapter) =>
  async <T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> => {
    requireConnected(state);
    try {
      return await callback(getAdapter());
    } catch (error: unknown) {
      throw ErrorFactory.createTryCatchError('PostgreSQL proxy transaction failed', error);
    }
  };

const createRawQuery =
  (
    state: PostgresProxyState,
    query: (sql: string, parameters: unknown[]) => Promise<QueryResult>
  ) =>
  async <T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> => {
    requireConnected(state);
    const out = await query(sql, parameters);
    return out.rows as T[];
  };

const createEnsureMigrationsTable =
  (
    state: PostgresProxyState,
    query: (sql: string, parameters: unknown[]) => Promise<QueryResult>
  ) =>
  async (): Promise<void> => {
    requireConnected(state);
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            scope VARCHAR(255) NOT NULL DEFAULT 'global',
            service VARCHAR(255) NOT NULL DEFAULT '',
            batch INTEGER NOT NULL,
            status VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, scope, service)
          )`,
        []
      );
    } catch (error) {
      throw SqlProxyHttpAdapterShared.createProxyNotReachableCliError(
        'PostgreSQL proxy',
        state.settings.baseUrl,
        error
      );
    }
  };

const createAdapter = (state: PostgresProxyState): IDatabaseAdapter => {
  const query = createQuery(state);
  const queryOne = createQueryOne(state);

  const adapter: IDatabaseAdapter = {
    async connect(): Promise<void> {
      SqlProxyHttpAdapterShared.ensureSignedProxyConfig(state.signed);
      state.connected = true;
    },

    async disconnect(): Promise<void> {
      state.connected = false;
    },

    query,
    queryOne,
    ping: createPing(queryOne),
    transaction: createTransaction(state, () => adapter),
    rawQuery: createRawQuery(state, query),
    ensureMigrationsTable: createEnsureMigrationsTable(state, query),

    getType(): SupportedDriver {
      return AdaptersEnum.postgresql;
    },
    isConnected(): boolean {
      return state.connected;
    },
    getPlaceholder(index: number): string {
      return `$${index}`;
    },
  };

  return adapter;
};

export const PostgreSQLProxyAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    const settings = buildProxySettings();
    const signed = buildSignedProxyConfig(settings);
    const state: PostgresProxyState = { connected: false, settings, signed };
    return createAdapter(state);
  },
});

export default PostgreSQLProxyAdapter;
