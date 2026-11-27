import type { QueryResult } from '@orm/DatabaseAdapter';

type CacheEntry = {
  data: QueryResult;
  timestamp: number;
};

const CACHE_TTL_MS = 5000;
const MAX_ENTRIES = 500;
const PRUNE_EVERY_N_SETS = 100;

export const ProxyCache = Object.freeze({
  create(maxEntries: number = MAX_ENTRIES) {
    const cache = new Map<string, CacheEntry>();
    const limit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : MAX_ENTRIES;
    let setsSincePrune = 0;

    const pruneExpired = (now: number): void => {
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) cache.delete(key);
      }
    };

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
        const now = Date.now();
        setsSincePrune += 1;
        if (setsSincePrune >= PRUNE_EVERY_N_SETS) {
          setsSincePrune = 0;
          pruneExpired(now);
        }

        // Refresh insertion order so the first key is always the oldest one.
        cache.delete(key);
        // Opportunistic hard cap: unique filter values must not grow the cache forever.
        if (cache.size >= limit) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) cache.delete(oldestKey);
        }
        cache.set(key, { data, timestamp: now });
      },

      clear(): void {
        cache.clear();
        setsSincePrune = 0;
      },
    });
  },
});
