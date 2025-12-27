/**
 * Cloudflare KV Cache Driver
 * Interfaces with the native KV binding in Cloudflare Workers
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Cloudflare } from '@config/cloudflare';
import { Logger } from '@config/logger';

/**
 * Create a new KV driver instance
 */
const create = (): CacheDriver => {
  // In Cloudflare Workers, the KV namespace is usually bound to a variable in the environment
  const kv = Cloudflare.getKVBinding('CACHE');

  return {
    async get<T>(key: string): Promise<T | null> {
      if (kv === null) return null;
      const value = await kv.get(key, { type: 'json' });
      return (value as T | null) ?? null;
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      if (kv === null) {
        Logger.warn('KV binding "CACHE" not found. Cache set ignored.');
        return;
      }

      const options: { expirationTtl?: number } = {};
      if (ttl !== undefined) {
        // KV expirationTtl must be at least 60 seconds
        options.expirationTtl = Math.max(60, ttl);
      }

      await kv.put(key, JSON.stringify(value), options);
    },

    async delete(key: string): Promise<void> {
      if (kv === null) return;
      await kv.delete(key);
    },

    async clear(): Promise<void> {
      // KV doesn't support clearing all keys easily without listing and deleting
      Logger.warn('KV clear() is not implemented due to Cloudflare KV limitations.');
      await Promise.resolve();
    },

    async has(key: string): Promise<boolean> {
      if (kv === null) return false;
      const value = await kv.get(key);
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
