/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 */

import { CacheDriver } from '@cache/CacheDriver';

/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 * Refactored to Functional Object pattern
 */
const create = (): CacheDriver => {
  const storage = new Map<string, { value: unknown; expires: number | null }>();

  return {
    get<T>(key: string): T | null {
      const item = storage.get(key);
      if (item === undefined) return null;

      if (item.expires !== null && item.expires < Date.now()) {
        storage.delete(key);
        return null;
      }

      return item.value as T;
    },

    set<T>(key: string, value: T, ttl?: number): void {
      const expires = ttl === undefined ? null : Date.now() + ttl * 1000;
      storage.set(key, { value, expires });
    },

    delete(key: string): void {
      storage.delete(key);
    },

    clear(): void {
      storage.clear();
    },

    has(key: string): boolean {
      const item = storage.get(key);
      if (item === undefined) return false;

      if (item.expires !== null && item.expires < Date.now()) {
        storage.delete(key);
        return false;
      }

      return true;
    },
  };
};

/**
 * MemoryDriver namespace - sealed for immutability
 */
export const MemoryDriver = Object.freeze({
  create,
});
