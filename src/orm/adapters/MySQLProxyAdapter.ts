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
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import {
  ensureSignedSettings,
  isRecord,
  requestSignedProxy,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';

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

export const MySQLProxyAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;
    const settings = buildProxySettings();

    Logger.info('[MySQLProxyAdapter] Created with runtime settings', {
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
      hasKeyId: (settings.keyId ?? '').trim() !== '',
      hasSecret: (settings.secret ?? '').trim() !== '',
    });

    return {
      async connect(): Promise<void> {
        ensureSignedSettings(buildSignedProxyConfig(settings));
        connected = true;
      },

      async disconnect(): Promise<void> {
        connected = false;
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
