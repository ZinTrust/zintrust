/* eslint-disable @typescript-eslint/require-await */
/**
 * PostgreSQL Proxy Adapter (HTTP)
 *
 * Used in Cloudflare Workers when POSTGRES_PROXY_URL is configured.
 */

import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
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

type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
};

const resolveBaseUrl = (): string => {
  const explicit = Env.POSTGRES_PROXY_URL.trim();
  if (explicit !== '') return explicit;
  const host = Env.POSTGRES_PROXY_HOST || '127.0.0.1';
  const port = Env.POSTGRES_PROXY_PORT;
  return `http://${host}:${port}`;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = resolveBaseUrl();
  const keyId = Env.POSTGRES_PROXY_KEY_ID || undefined;
  const secret = Env.POSTGRES_PROXY_SECRET || Env.APP_KEY || undefined;
  const timeoutMs = Env.POSTGRES_PROXY_TIMEOUT_MS;

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedSettings = (settings: ProxySettings): RemoteSignedJsonSettings => {
  return {
    baseUrl: settings.baseUrl,
    keyId: settings.keyId ?? '',
    secret: settings.secret ?? '',
    timeoutMs: settings.timeoutMs,
    missingUrlMessage: 'PostgreSQL proxy URL is missing (POSTGRES_PROXY_URL)',
    missingCredentialsMessage:
      'PostgreSQL proxy signing credentials are missing (POSTGRES_PROXY_KEY_ID / POSTGRES_PROXY_SECRET)',
    messages: {
      unauthorized: 'PostgreSQL proxy unauthorized',
      forbidden: 'PostgreSQL proxy forbidden',
      rateLimited: 'PostgreSQL proxy rate limited',
      rejected: 'PostgreSQL proxy rejected request',
      error: 'PostgreSQL proxy error',
      timedOut: 'PostgreSQL proxy request timed out',
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

const requestProxy = async <T>(
  settings: ProxySettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('PostgreSQL proxy URL is missing (POSTGRES_PROXY_URL)');
  }

  if (settings.keyId !== undefined && settings.secret !== undefined) {
    const signedSettings = buildSignedSettings(settings);
    return RemoteSignedJson.request<T>(signedSettings, path, payload);
  }

  Logger.warn('[postgres-proxy] Proxy signing disabled; sending unsigned request.');

  const response = await fetch(`${settings.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw ErrorFactory.createTryCatchError(
      `PostgreSQL proxy request failed (${response.status})`,
      text
    );
  }

  return (await response.json()) as T;
};

export const PostgreSQLProxyAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = true;
    const settings = buildProxySettings();

    return {
      async connect(): Promise<void> {
        if (settings.baseUrl.trim() === '') {
          throw ErrorFactory.createConfigError(
            'PostgreSQL proxy URL is missing (POSTGRES_PROXY_URL)'
          );
        }
        connected = true;
      },

      async disconnect(): Promise<void> {
        connected = true;
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await requestProxy<ProxyStatementResponse>(settings, '/zin/postgres/query', {
          sql,
          params: parameters,
        });
        return toQueryResult(out);
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await requestProxy<ProxyQueryOneResponse>(settings, '/zin/postgres/queryOne', {
          sql,
          params: parameters,
        });
        return out.row ?? null;
      },

      async ping(): Promise<void> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        await this.queryOne(QueryBuilder.create('').select('1').toSQL(), []);
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        try {
          return await callback(this);
        } catch (error: unknown) {
          throw ErrorFactory.createTryCatchError('PostgreSQL proxy transaction failed', error);
        }
      },

      async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await this.query(sql, parameters);
        return out.rows as T[];
      },

      getType(): SupportedDriver {
        return AdaptersEnum.postgresql;
      },
      isConnected(): boolean {
        return connected;
      },
      getPlaceholder(index: number): string {
        return `$${index}`;
      },
    };
  },
});

export default PostgreSQLProxyAdapter;
