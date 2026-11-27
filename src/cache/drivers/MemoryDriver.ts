/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { ErrorFactory } from '@exceptions/ZintrustError';

type UnrefableTimer = { unref: () => void };

function isUnrefableTimer(value: unknown): value is UnrefableTimer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'unref' in value &&
    typeof value.unref === 'function'
  );
}

/** Default hard cap for non-TTL entries, which the TTL sweep can never evict. */
export const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 * Refactored to Functional Object pattern
 */
const create = (maxEntries: number = DEFAULT_MAX_ENTRIES): CacheDriver => {
  const storage = new Map<string, { value: unknown; expires: number | null }>();
  const limit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;

  // Background cleanup interval (runs every 60 seconds)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of storage.entries()) {
      if (item.expires !== null && item.expires < now) {
        storage.delete(key);
      }
    }
  }, 60_000); // 60 seconds

  // Unref so it doesn't keep process alive (Node.js only)
  if (isUnrefableTimer(cleanupInterval)) {
    cleanupInterval.unref();
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      await Promise.resolve();
      const item = storage.get(key);
      if (item === undefined) return null;

      if (item.expires !== null && item.expires < Date.now()) {
        storage.delete(key);
        return null;
      }

      return item.value as T;
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const expires = ttl === undefined ? null : Date.now() + ttl * 1000;
      // Refresh insertion order so the first key is always the oldest one.
      storage.delete(key);
      // Non-TTL entries never expire, so enforce a hard cap on every write.
      if (storage.size >= limit) {
        const oldestKey = storage.keys().next().value;
        if (oldestKey !== undefined) storage.delete(oldestKey);
      }
      storage.set(key, { value, expires });
      await Promise.resolve();
    },

    async delete(key: string): Promise<void> {
      storage.delete(key);
      await Promise.resolve();
    },

    async clear(): Promise<void> {
      storage.clear();
      await Promise.resolve();
    },

    async has(key: string): Promise<boolean> {
      await Promise.resolve();
      const item = storage.get(key);
      if (item === undefined) return false;

      if (item.expires !== null && item.expires < Date.now()) {
        storage.delete(key);
        return false;
      }

      return true;
    },

    async dispose(): Promise<void> {
      clearInterval(cleanupInterval);
      storage.clear();
      await Promise.resolve();
    },

    getRedisClient(): unknown {
      throw ErrorFactory.createConfigError(
        'getRedisClient() is only supported by Redis cache driver, not memory driver'
      );
    },
  };
};

/**
 * MemoryDriver namespace - sealed for immutability
 */
export const MemoryDriver = Object.freeze({
  create,
});
