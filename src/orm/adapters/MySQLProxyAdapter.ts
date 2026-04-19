/* eslint-disable @typescript-eslint/require-await */
/**
 * MySQL Proxy Adapter (HTTP)
 *
 * Used in Cloudflare Workers when MYSQL_PROXY_URL is configured.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
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
  return SqlProxyHttpAdapterShared.buildProxySettingsFromEnv({
    urlKey: 'MYSQL_PROXY_URL',
    keyIdKey: 'MYSQL_PROXY_KEY_ID',
    secretKey: 'MYSQL_PROXY_SECRET',
    timeoutKey: 'MYSQL_PROXY_TIMEOUT_MS',
    sharedKeyIdKey: 'ZT_PROXY_KEY_ID',
    sharedSecretKey: 'ZT_PROXY_SECRET',
    sharedTimeoutKey: 'ZT_PROXY_TIMEOUT_MS',
  });
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => {
  return SqlProxyHttpAdapterShared.buildStandardSignedProxyConfig({
    settings,
    label: 'MySQL',
    urlKey: 'MYSQL_PROXY_URL',
    keyIdKey: 'MYSQL_PROXY_KEY_ID',
    secretKey: 'MYSQL_PROXY_SECRET',
  });
};

const isQueryResponse = (value: unknown): value is ProxyQueryResponse =>
  isRecord(value) && Array.isArray(value['rows']) && typeof value['rowCount'] === 'number';

const isQueryOneResponse = (value: unknown): value is ProxyQueryOneResponse =>
  isRecord(value) && 'row' in value;

type LoggedError = {
  message: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
};

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const describeErrorBody = (body: Record<string, unknown>): string | undefined => {
  const bodyCode = hasText(body['code']) ? body['code'].trim() : '';
  const bodyMessage = hasText(body['message']) ? body['message'].trim() : '';

  if (bodyCode !== '' && bodyMessage !== '') return `${bodyCode}: ${bodyMessage}`;
  if (bodyCode !== '') return bodyCode;
  if (bodyMessage !== '') return bodyMessage;

  return undefined;
};

const describeErrorRecord = (record: Record<string, unknown>): string | undefined => {
  const body = record['body'];
  if (isRecord(body)) {
    const describedBody = describeErrorBody(body);
    if (describedBody !== undefined) return describedBody;
  }

  const nestedDetails = describeErrorDetails(record['details']);
  if (nestedDetails !== undefined) return nestedDetails;

  if (hasText(record['message'])) return record['message'].trim();
  if (hasText(record['code'])) return record['code'].trim();

  return undefined;
};

const describeErrorDetails = (details: unknown): string | undefined => {
  if (hasText(details)) return details.trim();
  if (!isRecord(details)) return undefined;
  return describeErrorRecord(details);
};

const withMaybeProperty = <T extends Record<string, unknown>>(
  target: T,
  key: string,
  value: unknown
): T => {
  if (value === undefined) return target;
  return { ...target, [key]: value };
};

const toLoggedError = (error: unknown): LoggedError => {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const maybeError = error as Error & {
    code?: unknown;
    statusCode?: unknown;
    details?: unknown;
  };
  const detailSummary = describeErrorDetails(maybeError.details);
  const message =
    detailSummary !== undefined && !error.message.includes(detailSummary)
      ? `${error.message} (${detailSummary})`
      : error.message;

  let loggedError: LoggedError = {
    message,
  };

  loggedError = withMaybeProperty(
    loggedError,
    'code',
    hasText(maybeError.code) ? maybeError.code : undefined
  ) as LoggedError;
  loggedError = withMaybeProperty(
    loggedError,
    'statusCode',
    typeof maybeError.statusCode === 'number' ? maybeError.statusCode : undefined
  ) as LoggedError;
  loggedError = withMaybeProperty(loggedError, 'details', maybeError.details) as LoggedError;

  return loggedError;
};

const requestProxy = async <T>(
  state: { settings: ProxySettings; signed: SignedProxyConfig },
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  try {
    return await SqlProxyHttpAdapterShared.requestProxy<T>(state.signed, path, payload);
  } catch (error: unknown) {
    const loggedError = toLoggedError(error);
    Logger.error('[MySQLProxyAdapter] Proxy request failed', {
      ...Logger.withTraceSkipContext({
        path,
        baseUrl: state.settings.baseUrl,
        timeoutMs: state.settings.timeoutMs,
        hasKeyId: (state.settings.keyId ?? '').trim() !== '',
        hasSecret: (state.settings.secret ?? '').trim() !== '',
        error: loggedError.message,
        ...withMaybeProperty({}, 'errorCode', loggedError.code),
        ...withMaybeProperty({}, 'errorStatusCode', loggedError.statusCode),
        ...withMaybeProperty({}, 'errorDetails', loggedError.details),
      }),
    });
    throw error;
  }
};

const resolveProxyMode = (): ProxyMode => {
  return SqlProxyHttpAdapterShared.resolveProxyModeFromEnv('MYSQL_PROXY_MODE');
};

type MySQLProxyState = {
  connected: boolean;
  settings: ProxySettings;
  signed: SignedProxyConfig;
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
            state,
            '/zin/mysql/statement',
            await createStatementPayload(sql, parameters)
          )
        : await requestProxy<ProxyStatementResponse>(state, '/zin/mysql/query', {
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
      const out = await requestProxy<ProxyQueryOneResponse>(state, '/zin/mysql/queryOne', {
        sql,
        params: parameters,
      });
      return out.row ?? null;
    }

    const out = await requestProxy<ProxyStatementResponse>(
      state,
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
      ensureSignedSettings(state.signed);
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

    async ensureMigrationsTable(): Promise<void> {
      requireConnected(state);
      try {
        await query(
          `CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            scope VARCHAR(255) NOT NULL DEFAULT 'global',
            service VARCHAR(255) NOT NULL DEFAULT '',
            batch INTEGER NOT NULL,
            status VARCHAR(255) NOT NULL,
            applied_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, scope, service)
          )`,
          []
        );
      } catch (error) {
        throw SqlProxyHttpAdapterShared.createProxyNotReachableCliError(
          'MySQL proxy',
          state.settings.baseUrl,
          error
        );
      }
    },

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
    const signed = buildSignedProxyConfig(settings);
    const state: MySQLProxyState = { connected: false, settings, signed };

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
