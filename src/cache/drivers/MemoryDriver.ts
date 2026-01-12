/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 */

import type { CacheDriver } from '@cache/CacheDriver';

/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 * Refactored to Functional Object pattern
 */
const create = (): CacheDriver => {
  const storage = new Map<string, { value: unknown; expires: number | null }>();

  // Background cleanup interval (runs every 60 seconds)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of storage.entries()) {
      if (item.expires !== null && item.expires < now) {
        storage.delete(key);
      }
    }
  }, 60_000); // 60 seconds

  // Unref so it doesn't keep process alive
  cleanupInterval.unref();

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
  };
};

/**
 * MemoryDriver namespace - sealed for immutability
 */
export const MemoryDriver = Object.freeze({
  create,
});
