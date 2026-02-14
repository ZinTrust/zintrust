/* eslint-disable @typescript-eslint/require-await */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { SupportedDriver } from '@migrations/enum';
import type { IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { ProxyCache } from '@orm/adapters/ProxyCache';
import {
  ensureSignedSettings,
  requestSignedProxy,
  type ProxySettings,
  type SignedProxyConfig,
} from '@orm/adapters/SqlProxyAdapterUtils';

const getCacheKey = (collection: string, operation: string, args: unknown): string => {
  return `${collection}:${operation}:${JSON.stringify(args)}`;
};

const resolveProxyUrl = (): string => {
  const url = Env.get('MONGODB_PROXY_URL', '');
  if (typeof url === 'string' && url.trim() !== '') return url;

  const host = Env.get('MONGODB_PROXY_HOST', '127.0.0.1');
  const port = Env.getInt('MONGODB_PROXY_PORT', 8792);
  return `http://${host}:${port}`;
};

const buildProxySettings = (): ProxySettings => {
  const baseUrl = resolveProxyUrl();
  const keyId = Env.get('MONGODB_PROXY_KEY_ID', '');
  const secret = Env.get('MONGODB_PROXY_SECRET', '');
  const timeoutMs = Env.getInt('MONGODB_PROXY_TIMEOUT_MS', 30000);

  return { baseUrl, keyId, secret, timeoutMs };
};

const buildSignedProxyConfig = (settings: ProxySettings): SignedProxyConfig => ({
  settings,
  missingUrlMessage: 'MongoDB proxy URL is missing',
  missingCredentialsMessage: 'MongoDB proxy signing credentials are missing',
  messages: {
    unauthorized: 'MongoDB proxy unauthorized',
    forbidden: 'MongoDB proxy forbidden',
    rateLimited: 'MongoDB proxy rate limited',
    rejected: 'MongoDB proxy rejected',
    error: 'MongoDB proxy error',
    timedOut: 'MongoDB proxy timed out',
  },
});

export function createMongoDBProxyAdapter(): IDatabaseAdapter {
  let connected = false;
  const cache = ProxyCache.create();
  const settings = buildProxySettings();

  return {
    async connect(): Promise<void> {
      ensureSignedSettings(buildSignedProxyConfig(settings));
      Logger.info(`Connecting to MongoDB via proxy: ${settings.baseUrl}`);
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
      const pattern = /^(\w+)\.(\w+)\((.+)\$/;
      const match = pattern.exec(_sql);
      if (!match) {
        throw ErrorFactory.createGeneralError('Invalid MongoDB query format');
      }

      const [, collection, operation, argsStr] = match;
      const args = JSON.parse(argsStr) as unknown;

      const cacheKey = getCacheKey(collection, operation, args);
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await requestSignedProxy<{ success: boolean; result: unknown }>(
        buildSignedProxyConfig(settings),
        '/zin/mongodb/operation',
        { collection, operation, args }
      );

      const result = response.result;
      const queryResult: QueryResult = {
        rows: (Array.isArray(result) ? result : [result]) as Record<string, unknown>[],
        rowCount: Array.isArray(result) ? result.length : 1,
      };

      cache.set(cacheKey, queryResult);
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
