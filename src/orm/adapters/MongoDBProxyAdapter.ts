import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { SupportedDriver } from '@migrations/enum';
import type { IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { SignedRequest } from '@security/SignedRequest';

type CacheEntry = {
  data: QueryResult;
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;

const getCacheKey = (collection: string, operation: string, args: unknown): string => {
  return `${collection}:${operation}:${JSON.stringify(args)}`;
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
  const url = Env.get('MONGODB_PROXY_URL', '');
  if (url) return url;

  const host = Env.get('MONGODB_PROXY_HOST', '127.0.0.1');
  const port = Env.getInt('MONGODB_PROXY_PORT', 8792);
  return `http://${host}:${port}`;
};

const createSignedRequest = async (
  url: string,
  body: string
): Promise<{ headers: Record<string, string>; body: string }> => {
  const keyId = Env.get('MONGODB_PROXY_KEY_ID', '');
  const secret = Env.get('MONGODB_PROXY_SECRET', '').trim() || Env.APP_KEY || '';

  if (!keyId || !secret) {
    return { headers: { 'content-type': 'application/json' }, body };
  }

  const urlObj = new URL(url);
  const signResult = await SignedRequest.createHeaders({
    method: 'POST',
    url: urlObj,
    body,
    keyId,
    secret,
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

const sendRequest = async (
  collection: string,
  operation: string,
  args: unknown
): Promise<unknown> => {
  const proxyUrl = resolveProxyUrl();
  const payload = { collection, operation, args };
  const body = JSON.stringify(payload);

  const { headers, body: signedBody } = await createSignedRequest(proxyUrl, body);

  const timeout = Env.getInt('MONGODB_PROXY_TIMEOUT_MS', 30000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

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
      throw ErrorFactory.createDatabaseError(`MongoDB proxy error: ${errorText}`);
    }

    const result = (await response.json()) as { success: boolean; result: unknown };
    return result.result;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw ErrorFactory.createGeneralError('MongoDB proxy request timed out');
    }
    throw error;
  }
};

export function createMongoDBProxyAdapter(): IDatabaseAdapter {
  let connected = false;

  return {
    async connect(): Promise<void> {
      const proxyUrl = resolveProxyUrl();
      Logger.info(`Connecting to MongoDB via proxy: ${proxyUrl}`);
      connected = true;
    },

    async disconnect(): Promise<void> {
      connected = false;
      cache.clear();
      Logger.info('Disconnected from MongoDB proxy');
    },

    async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
      if (!connected) {
        throw ErrorFactory.createConnectionError('Not connected to MongoDB proxy');
      }

      // Parse MongoDB-like query (simple implementation)
      // Expected format: collection.operation({...})
      const match = _sql.match(/^(\w+)\.(\w+)\((.+)\$/);
      if (!match) {
        throw ErrorFactory.createGeneralError('Invalid MongoDB query format');
      }

      const [, collection, operation, argsStr] = match;
      const args = JSON.parse(argsStr) as unknown;

      const cacheKey = getCacheKey(collection, operation, args);
      const cached = getCachedResult(cacheKey);
      if (cached) return cached;

      const result = await sendRequest(collection, operation, args);

      const queryResult: QueryResult = {
        rows: (Array.isArray(result) ? result : [result]) as Record<string, unknown>[],
        rowCount: Array.isArray(result) ? result.length : 1,
      };

      setCachedResult(cacheKey, queryResult);
      return queryResult;
    },

    async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
      const result = await this.query(sql, parameters);
      return result.rows[0] ?? null;
    },

    async ping(): Promise<void> {
      if (!connected) {
        throw ErrorFactory.createConnectionError('Not connected to MongoDB proxy');
      }
    },

    async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
      // MongoDB proxy doesn't support traditional transactions via HTTP
      Logger.warn('MongoDB proxy adapter does not support transactions');
      return callback(this);
    },

    async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const result = await this.query(sql, parameters ?? []);
      return result.rows as T[];
    },

    getType(): SupportedDriver {
      return 'mongodb-proxy' as SupportedDriver;
    },

    isConnected(): boolean {
      return connected;
    },

    getPlaceholder(index: number): string {
      return `$${index}`;
    },
  };
}
