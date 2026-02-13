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
import { normalizeSigningCredentials } from '@proxy/SigningService';

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

const resolveSigningPrefix = (baseUrl: string): string | undefined => {
  try {
    const parsed = new URL(baseUrl);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path === '' || path === '/') return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = Env.MYSQL_PROXY_URL;
  const keyId = Env.MYSQL_PROXY_KEY_ID ?? '';
  const secret = Env.MYSQL_PROXY_SECRET ?? '';
  const timeoutMs = Env.MYSQL_PROXY_TIMEOUT_MS;

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedSettings = (settings: ProxySettings): RemoteSignedJsonSettings => {
  const creds = normalizeSigningCredentials({
    keyId: settings.keyId ?? '',
    secret: settings.secret ?? '',
  });
  return {
    baseUrl: settings.baseUrl,
    keyId: creds.keyId,
    secret: creds.secret,
    timeoutMs: settings.timeoutMs,
    signaturePathPrefixToStrip: resolveSigningPrefix(settings.baseUrl),
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

const ensureSignedSettings = (settings: ProxySettings): RemoteSignedJsonSettings => {
  const signedSettings = buildSignedSettings(settings);
  if (signedSettings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('MySQL proxy URL is missing (MYSQL_PROXY_URL)');
  }
  if (signedSettings.keyId.trim() === '' || signedSettings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'MySQL proxy signing credentials are missing (MYSQL_PROXY_KEY_ID / MYSQL_PROXY_SECRET)'
    );
  }
  return signedSettings;
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

  const signedSettings = ensureSignedSettings(settings);
  try {
    return await RemoteSignedJson.request<T>(signedSettings, path, payload);
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
        ensureSignedSettings(settings);
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
