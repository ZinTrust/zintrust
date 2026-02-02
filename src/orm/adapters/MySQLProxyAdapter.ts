/* eslint-disable @typescript-eslint/require-await */
/**
 * MySQL Proxy Adapter (HTTP)
 *
 * Used in Cloudflare Workers when MYSQL_PROXY_URL is configured.
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

type ProxySettings = {
  baseUrl: string;
  keyId?: string;
  secret?: string;
  timeoutMs: number;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = Env.get('MYSQL_PROXY_URL');
  const keyId = Env.get('MYSQL_PROXY_KEY_ID') || undefined;
  const secret = Env.get('MYSQL_PROXY_SECRET') || undefined;
  const timeoutMs = Env.getInt('MYSQL_PROXY_TIMEOUT_MS', Env.getInt('ZT_PROXY_TIMEOUT_MS', 30000));

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedSettings = (settings: ProxySettings): RemoteSignedJsonSettings => {
  return {
    baseUrl: settings.baseUrl,
    keyId: settings.keyId ?? '',
    secret: settings.secret ?? '',
    timeoutMs: settings.timeoutMs,
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
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isQueryResponse = (value: unknown): value is ProxyQueryResponse =>
  isRecord(value) && Array.isArray(value['rows']) && typeof value['rowCount'] === 'number';

const isQueryOneResponse = (value: unknown): value is ProxyQueryOneResponse =>
  isRecord(value) && 'row' in value;

const getExecMeta = (value: unknown): { changes: number; lastRowId?: number | string | bigint } => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return { changes: 0 };
  const meta = value['meta'];
  if (!isRecord(meta)) return { changes: 0 };
  const changes = typeof meta['changes'] === 'number' ? meta['changes'] : 0;
  const lastRowId = meta['lastRowId'];
  return { changes, lastRowId: lastRowId as number | string | bigint | undefined };
};

const requestProxy = async <T>(
  settings: ProxySettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('MySQL proxy URL is missing (MYSQL_PROXY_URL)');
  }

  if (settings.keyId !== undefined && settings.secret !== undefined) {
    const signedSettings = buildSignedSettings(settings);
    return RemoteSignedJson.request<T>(signedSettings, path, payload);
  }

  Logger.warn('[mysql-proxy] Proxy signing disabled; sending unsigned request.');

  const response = await fetch(`${settings.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw ErrorFactory.createTryCatchError(`MySQL proxy request failed (${response.status})`, text);
  }

  return (await response.json()) as T;
};

export const MySQLProxyAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;
    const settings = buildProxySettings();

    return {
      async connect(): Promise<void> {
        if (settings.baseUrl.trim() === '') {
          throw ErrorFactory.createConfigError('MySQL proxy URL is missing (MYSQL_PROXY_URL)');
        }
        connected = true;
        Logger.info('✓ MySQL proxy connected');
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ MySQL proxy disconnected');
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await requestProxy<ProxyStatementResponse>(settings, '/zin/mysql/query', {
          sql,
          params: parameters,
        });

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

        const meta = getExecMeta(out);
        return { rows: [], rowCount: meta.changes, lastInsertId: meta.lastRowId };
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await requestProxy<ProxyQueryOneResponse>(settings, '/zin/mysql/queryOne', {
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
          throw ErrorFactory.createTryCatchError('MySQL proxy transaction failed', error);
        }
      },

      async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const out = await this.query(sql, parameters);
        return out.rows as T[];
      },

      getType(): SupportedDriver {
        return AdaptersEnum.mysql;
      },
      isConnected(): boolean {
        return connected;
      },
      getPlaceholder(_index: number): string {
        return '?';
      },
    };
  },
});

export default MySQLProxyAdapter;
