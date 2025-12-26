/**
 * Cache Driver Interface
 * Defines contract for different cache implementations
 */

export interface CacheDriver {
  /**
   * Get an item from the cache
   */
  get<T>(key: string): T | null;

  /**
   * Store an item in the cache
   */
  set<T>(key: string, value: T, ttl?: number): void;

  /**
   * Remove an item from the cache
   */
  delete(key: string): void;

  /**
   * Clear all items from the cache
   */
  clear(): void;

  /**
   * Check if an item exists in the cache
   */
  has(key: string): boolean;
}

// Runtime marker to make this type-only module coverable in V8 coverage.
export const CACHE_DRIVER_INTERFACE = 'CacheDriver';
