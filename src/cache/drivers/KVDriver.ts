/**
 * Cloudflare KV Cache Driver
 * Interfaces with the native KV binding in Cloudflare Workers
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Logger } from '@config/logger';

interface KVNamespace {
  get(
    key: string,
    options?: { type: 'text' | 'json' | 'arrayBuffer' | 'stream' }
  ): Promise<unknown>;
  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer | FormData,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Create a new KV driver instance
 */
const create = (): CacheDriver => {
  // In Cloudflare Workers, the KV namespace is usually bound to a variable in the environment
  const env = (globalThis as Record<string, unknown>)['env'] as Record<string, unknown> | undefined;
  const kv = env === undefined ? undefined : (env['CACHE'] as KVNamespace);

  return {
    get<T>(key: string): T | null {
      if (kv === undefined) return null;
      const value = kv.get(key, { type: 'json' });
      return value as T;
    },

    set<T>(key: string, value: T, ttl?: number): void {
      if (kv === undefined) {
        Logger.warn('KV binding "CACHE" not found. Cache set ignored.');
        return;
      }

      const options: { expirationTtl?: number } = {};
      if (ttl !== undefined) {
        // KV expirationTtl must be at least 60 seconds
        options.expirationTtl = Math.max(60, ttl);
      }

      kv.put(key, JSON.stringify(value), options);
    },

    delete(key: string): void {
      if (kv === undefined) return;
      kv.delete(key);
    },

    clear(): void {
      // KV doesn't support clearing all keys easily without listing and deleting
      Logger.warn('KV clear() is not implemented due to Cloudflare KV limitations.');
    },

    has(key: string): boolean {
      if (kv === undefined) return false;
      const value = kv.get(key);
      return value !== null;
    },
  };
};

/**
 * KVDriver namespace - sealed for immutability
 */
export const KVDriver = Object.freeze({
  create,
});
