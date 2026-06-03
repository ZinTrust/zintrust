/**
 * Cache Driver Interface
 * Defines contract for different cache implementations
 */

export interface CacheDriver {
  /**
   * Get an item from the cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Get many items from the cache in a single round-trip when the driver
   * supports it (e.g. Redis MGET). Results are returned in the same order as
   * the requested keys, with `null` for misses. Optional: callers fall back to
   * issuing individual `get` calls when a driver does not implement it.
   */
  many?<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Store an item in the cache
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Remove an item from the cache
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all items from the cache
   */
  clear(): Promise<void>;

  /**
   * Check if an item exists in the cache
   */
  has(key: string): Promise<boolean>;

  /**
   * Atomically increment a numeric cache value when the driver supports it.
   */
  increment?(key: string, amount?: number): Promise<number>;

  /**
   * Atomically decrement a numeric cache value when the driver supports it.
   */
  decrement?(key: string, amount?: number): Promise<number>;

  /**
   * Dispose of resources (optional cleanup method)
   */
  dispose?(): Promise<void>;

  /**
   * Get the underlying Redis client for advanced operations like transactions
   * Only supported by Redis driver, throws error for other drivers
   */
  getRedisClient?(): unknown;
}

// Runtime marker to make this type-only module coverable in V8 coverage.
export const CACHE_DRIVER_INTERFACE = 'CacheDriver';
