/* eslint-disable @typescript-eslint/require-await */
/**
 * MySQL Proxy Adapter (HTTP)
 *
 * Used in Cloudflare Workers when MYSQL_PROXY_URL is configured.
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
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
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

type ProxyQueryResponse = {
  rows: Record<string, unknown>[];
  rowCount: number;
  lastInsertId?: string | number | bigint;
};

type ProxyQueryOneResponse = {
  row: Record<string, unknown> | null;
};

type ProxyExecResponse = {
  ok: boolean;
  meta?: { changes?: number; lastRowId?: number | string | bigint };
};

type ProxyStatementResponse = ProxyQueryResponse | ProxyQueryOneResponse | ProxyExecResponse;

const buildProxySettings = (): ProxySettings => {
  const baseUrl = Env.MYSQL_PROXY_URL;
  const keyId = Env.MYSQL_PROXY_KEY_ID ?? '';
  const secret = Env.MYSQL_PROXY_SECRET ?? '';
  const timeoutMs = Env.MYSQL_PROXY_TIMEOUT_MS;

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => ({
  settings,
  missingUrlMessage: 'MySQL proxy URL is missing (MYSQL_PROXY_URL)',
  missingCredentialsMessage:
    'MySQL proxy signing credentials are missing (MYSQL_PROXY_KEY_ID / MYSQL_PROXY_SECRET)',
  messages: {
    unauthorized: 'MySQL proxy unauthorized',
    forbidden: 'MySQL proxy forbidden',
    rateLimited: 'MySQL proxy rate limited',
    rejected: 'MySQL proxy rejected request',
    error: 'MySQL proxy error',
    timedOut: 'MySQL proxy request timed out',
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
): Promise<T> => {
  const signedProxyConfig = buildSignedProxyConfig(settings);
  try {
    return await requestSignedProxy<T>(signedProxyConfig, path, payload);
  } catch (error: unknown) {
    Logger.error('[MySQLProxyAdapter] Proxy request failed', {
      path,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
      hasKeyId: (settings.keyId ?? '').trim() !== '',
      hasSecret: (settings.secret ?? '').trim() !== '',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

type ProxyMode = 'sql' | 'registry';

const resolveProxyMode = (): ProxyMode => {
  return resolveSqlProxyMode('MYSQL_PROXY_MODE');
};

type MySQLProxyState = {
  connected: boolean;
  settings: ProxySettings;
};

const requireConnected = (state: MySQLProxyState): void => {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
};

const toQueryResult = (out: ProxyStatementResponse): QueryResult => {
  if (isQueryResponse(out)) {
    return {
      rows: out.rows,
      rowCount: out.rowCount,
      lastInsertId: out.lastInsertId,
    };
  }

  if (isQueryOneResponse(out)) {
    const row = out.row;
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  const meta = getExecMetaWithLastRowId(out);
  return { rows: [], rowCount: meta.changes, lastInsertId: meta.lastRowId };
};

const createQuery =
  (state: MySQLProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<QueryResult> => {
    requireConnected(state);
    const mode = resolveProxyMode();
    const out =
      mode === 'registry'
        ? await requestProxy<ProxyStatementResponse>(
            state.settings,
            '/zin/mysql/statement',
            await createStatementPayload(sql, parameters)
          )
        : await requestProxy<ProxyStatementResponse>(state.settings, '/zin/mysql/query', {
            sql,
            params: parameters,
          });

    return toQueryResult(out);
  };

const createQueryOne =
  (state: MySQLProxyState) =>
  async (sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> => {
    requireConnected(state);
    const mode = resolveProxyMode();
    if (mode !== 'registry') {
      const out = await requestProxy<ProxyQueryOneResponse>(state.settings, '/zin/mysql/queryOne', {
        sql,
        params: parameters,
      });
      return out.row ?? null;
    }

    const out = await requestProxy<ProxyStatementResponse>(
      state.settings,
      '/zin/mysql/statement',
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
  (state: MySQLProxyState, getAdapter: () => IDatabaseAdapter) =>
  async <T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> => {
    requireConnected(state);
    try {
      return await callback(getAdapter());
    } catch (error: unknown) {
      throw ErrorFactory.createTryCatchError('MySQL proxy transaction failed', error);
    }
  };

const createRawQuery =
  (state: MySQLProxyState, query: (sql: string, parameters: unknown[]) => Promise<QueryResult>) =>
  async <T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> => {
    requireConnected(state);
    const out = await query(sql, parameters);
    return out.rows as T[];
  };

const createAdapter = (state: MySQLProxyState): IDatabaseAdapter => {
  const query = createQuery(state);
  const queryOne = createQueryOne(state);
  const ping = createPing(queryOne);

  const adapter: IDatabaseAdapter = {
    async connect(): Promise<void> {
      ensureSignedSettings(buildSignedProxyConfig(state.settings));
      state.connected = true;
    },

    async disconnect(): Promise<void> {
      state.connected = false;
    },

    query,
    queryOne,
    ping,

    transaction: createTransaction(state, () => adapter),
    rawQuery: createRawQuery(state, query),

    getType(): SupportedDriver {
      return AdaptersEnum.mysql;
    },
    isConnected(): boolean {
      return state.connected;
    },
    getPlaceholder(_index: number): string {
      return '?';
    },
  };

  return adapter;
};

export const MySQLProxyAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    const settings = buildProxySettings();
    const state: MySQLProxyState = { connected: false, settings };

    Logger.info('[MySQLProxyAdapter] Created with runtime settings', {
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
      hasKeyId: (settings.keyId ?? '').trim() !== '',
      hasSecret: (settings.secret ?? '').trim() !== '',
    });

    return createAdapter(state);
  },
});

export default MySQLProxyAdapter;
