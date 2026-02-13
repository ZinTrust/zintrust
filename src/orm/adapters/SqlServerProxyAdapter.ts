import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { SupportedDriver } from '@migrations/enum';
import type { IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { normalizeSigningCredentials } from '@proxy/SigningService';
import { SignedRequest } from '@security/SignedRequest';

type CacheEntry = {
  data: QueryResult;
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;

const getCacheKey = (sql: string, params: unknown[]): string => {
  return `${sql}:${JSON.stringify(params)}`;
};

const getCachedResult = (key: string): QueryResult | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

const setCachedResult = (key: string, data: QueryResult): void => {
  cache.set(key, { data, timestamp: Date.now() });
};

const resolveProxyUrl = (): string => {
  const url = Env.get('SQLSERVER_PROXY_URL', '');
  if (url) return url;

  const host = Env.get('SQLSERVER_PROXY_HOST', '127.0.0.1');
  const port = Env.getInt('SQLSERVER_PROXY_PORT', 8793);
  return `http://${host}:${port}`;
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

const buildSigningUrl = (requestUrl: URL, baseUrl: string): URL => {
  const prefix = resolveSigningPrefix(baseUrl);
  if (!prefix) return requestUrl;

  if (requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`)) {
    const signingUrl = new URL(requestUrl.toString());
    const stripped = requestUrl.pathname.slice(prefix.length);
    signingUrl.pathname = stripped.startsWith('/') ? stripped : `/${stripped}`;
    return signingUrl;
  }

  return requestUrl;
};

const createSignedRequest = async (
  url: string,
  body: string
): Promise<{ headers: Record<string, string>; body: string }> => {
  const creds = normalizeSigningCredentials({
    keyId: Env.get('SQLSERVER_PROXY_KEY_ID', ''),
    secret: Env.get('SQLSERVER_PROXY_SECRET', ''),
  });

  if (creds.keyId.trim() === '' || creds.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'SQL Server proxy signing credentials are missing (SQLSERVER_PROXY_KEY_ID / SQLSERVER_PROXY_SECRET)'
    );
  }

  const urlObj = new URL(url);
  const signingUrl = buildSigningUrl(urlObj, url);
  const signResult = await SignedRequest.createHeaders({
    method: 'POST',
    url: signingUrl,
    body,
    keyId: creds.keyId,
    secret: creds.secret,
  });

  return {
    headers: {
      'content-type': 'application/json',
      'x-zt-key-id': signResult['x-zt-key-id'],
      'x-zt-timestamp': signResult['x-zt-timestamp'],
      'x-zt-nonce': signResult['x-zt-nonce'],
      'x-zt-body-sha256': signResult['x-zt-body-sha256'],
      'x-zt-signature': signResult['x-zt-signature'],
    },
    body,
  };
};

const sendQuery = async (sql: string, params: unknown[]): Promise<QueryResult> => {
  const proxyUrl = resolveProxyUrl();
  const payload = { sql, params };
  const body = JSON.stringify(payload);

  const { headers, body: signedBody } = await createSignedRequest(proxyUrl, body);

  const timeout = Env.getInt('SQLSERVER_PROXY_TIMEOUT_MS', 30000);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: signedBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw ErrorFactory.createDatabaseError(`SQL Server proxy error: ${errorText}`);
    }

    const result = (await response.json()) as QueryResult;
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw ErrorFactory.createGeneralError('SQL Server proxy request timed out');
    }
    throw error;
  }
};

export function createSqlServerProxyAdapter(): IDatabaseAdapter {
  let connected = false;
  let inTransaction = false;

  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async connect(): Promise<void> {
      const proxyUrl = resolveProxyUrl();
      Logger.info(`Connecting to SQL Server via proxy: ${proxyUrl}`);
      connected = true;
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async disconnect(): Promise<void> {
      connected = false;
      inTransaction = false;
      cache.clear();
      Logger.info('Disconnected from SQL Server proxy');
    },

    async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
      if (!connected) {
        throw ErrorFactory.createConnectionError('Not connected to SQL Server proxy');
      }

      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const cacheKey = getCacheKey(sql, parameters);
        const cached = getCachedResult(cacheKey);
        if (cached) return cached;

        const result = await sendQuery(sql, parameters);
        setCachedResult(cacheKey, result);
        return result;
      }

      return sendQuery(sql, parameters);
    },

    async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
      const result = await this.query(sql, parameters);
      return result.rows[0] ?? null;
    },

    async ping(): Promise<void> {
      if (!connected) {
        throw ErrorFactory.createConnectionError('Not connected to SQL Server proxy');
      }
      await this.query('SELECT 1 AS ping', []);
    },

    async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
      if (inTransaction) {
        throw ErrorFactory.createGeneralError('Transaction already in progress');
      }

      inTransaction = true;
      try {
        await this.query('BEGIN TRANSACTION', []);
        const result = await callback(this);
        await this.query('COMMIT', []);
        return result;
      } catch (error) {
        await this.query('ROLLBACK', []);
        throw error;
      } finally {
        inTransaction = false;
      }
    },

    async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const result = await this.query(sql, parameters ?? []);
      return result.rows as T[];
    },

    getType(): SupportedDriver {
      return 'sqlserver-proxy' as SupportedDriver;
    },

    isConnected(): boolean {
      return connected;
    },

    getPlaceholder(index: number): string {
      return `@param${index}`;
    },
  };
}
