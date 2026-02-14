import type { QueryResult } from '@orm/DatabaseAdapter';

type CacheEntry = {
  data: QueryResult;
  timestamp: number;
};

const CACHE_TTL_MS = 5000;

export const ProxyCache = Object.freeze({
  create() {
    const cache = new Map<string, CacheEntry>();

    return Object.freeze({
      get(key: string): QueryResult | null {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
          cache.delete(key);
          return null;
        }
        return entry.data;
      },

      set(key: string, data: QueryResult): void {
        cache.set(key, { data, timestamp: Date.now() });
      },

      clear(): void {
        cache.clear();
      },
    });
  },
});
