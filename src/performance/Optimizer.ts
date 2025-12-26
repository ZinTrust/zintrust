/**
 * Performance Optimizations for Code Generation
 * Implements caching, lazy-loading, and parallel generation
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fs } from '@node-singletons';
import * as path from 'node:path';

export interface IGenerationCache {
  get(type: string, params: Record<string, unknown>): string | null;
  set(type: string, params: Record<string, unknown>, code: string): void;
  save(): void;
  clear(): void;
  getStats(): {
    size: number;
    entries: number;
    diskUsage: string;
    keys: string[];
  };
}

interface CacheState {
  cache: Map<string, { code: string; timestamp: number }>;
  cacheDir: string;
  ttlMs: number;
  cleanupInterval?: NodeJS.Timeout;
}

/**
 * Generation Cache - Cache generated code to avoid re-generating identical code
 * Sealed namespace for immutability
 */
export const GenerationCache = Object.freeze({
  /**
   * Create a new generation cache instance
   */
  create(
    cacheDir: string = path.join(process.cwd(), '.gen-cache'),
    ttlMs: number = 3600000
  ): IGenerationCache {
    const state: CacheState = {
      cache: new Map(),
      cacheDir,
      ttlMs,
    };

    // Initialize
    loadFromDisk(state);

    // Active cleanup every 10 minutes
    state.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of state.cache.entries()) {
        if (now - entry.timestamp > state.ttlMs) {
          state.cache.delete(key);
          // Also try to delete from disk
          const file = path.join(state.cacheDir, `${key}.json`);
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        }
      }
    }, 600000);

    return {
      /**
       * Get from cache
       */
      get(type: string, params: Record<string, unknown>): string | null {
        const key = getCacheKey(type, params);
        const entry = state.cache.get(key);

        if (entry === undefined) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > state.ttlMs) {
          state.cache.delete(key);
          const file = path.join(state.cacheDir, `${key}.json`);
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
          return null;
        }

        return entry.code;
      },

      /**
       * Set in cache
       */
      set(type: string, params: Record<string, unknown>, code: string): void {
        const key = getCacheKey(type, params);
        state.cache.set(key, {
          code,
          timestamp: Date.now(),
        });
      },

      /**
       * Save cache to disk
       */
      save(): void {
        saveCacheToDisk(state);
      },

      /**
       * Clear cache
       */
      clear(): void {
        if (state.cleanupInterval) {
          clearInterval(state.cleanupInterval);
        }
        clearCache(state);
      },

      /**
       * Get cache statistics
       */
      getStats(): {
        size: number;
        entries: number;
        diskUsage: string;
        keys: string[];
      } {
        return getCacheStats(state);
      },
    };
  },
});

/**
 * Save cache to disk
 */
function saveCacheToDisk(state: CacheState): void {
  if (fs.existsSync(state.cacheDir) === false) {
    fs.mkdirSync(state.cacheDir, { recursive: true });
  }

  for (const [key, entry] of state.cache.entries()) {
    const file = path.join(state.cacheDir, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  }
}

/**
 * Clear cache
 */
function clearCache(state: CacheState): void {
  state.cache.clear();
  if (fs.existsSync(state.cacheDir) === true) {
    fs.rmSync(state.cacheDir, { recursive: true });
  }
}

/**
 * Get cache statistics
 */
function getCacheStats(state: CacheState): {
  size: number;
  entries: number;
  diskUsage: string;
  keys: string[];
} {
  let diskUsage = 0;
  if (fs.existsSync(state.cacheDir) === true) {
    const files = fs.readdirSync(state.cacheDir);
    for (const file of files) {
      const stats = fs.statSync(path.join(state.cacheDir, file));
      diskUsage += stats.size;
    }
  }

  return {
    size: diskUsage,
    entries: state.cache.size,
    diskUsage: formatBytes(diskUsage),
    keys: Array.from(state.cache.keys()),
  };
}

/**
 * Format bytes as human-readable
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB'];
  let size = bytes;
  let i = 0;
  while (size > 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Get cache key from params
 */
function getCacheKey(type: string, params: Record<string, unknown>): string {
  // Use a more efficient key generation
  const paramStr = JSON.stringify(params);
  // Simple hash-like string for the key
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) {
    const char = paramStr.codePointAt(i);
    hash = (hash << 5) - hash + (char ?? 0);
    hash = toInt32(hash); // Convert to 32bit integer
  }
  return `${type}:${hash.toString(36)}:${Buffer.from(paramStr.slice(0, 32)).toString('base64')}`;
}

/**
 * Convert a number to a signed 32-bit integer (equivalent to JS ToInt32)
 */
function toInt32(value: number): number {
  const truncated = Math.trunc(value);
  const uint32 = ((truncated % 4294967296) + 4294967296) % 4294967296;
  return uint32 > 2147483647 ? uint32 - 4294967296 : uint32;
}

/**
 * Load cache from disk
 */
function loadFromDisk(state: CacheState): void {
  if (fs.existsSync(state.cacheDir) === true) {
    try {
      const files = fs.readdirSync(state.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json') === true) {
          const content = fs.readFileSync(path.join(state.cacheDir, file), 'utf-8');
          const data = JSON.parse(content);
          state.cache.set(file.replace('.json', ''), data);
        }
      }
    } catch (err) {
      Logger.error(
        `Failed to load cache from disk: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export interface ILazyLoader {
  load<T>(modulePath: string): Promise<T>;
  preload(modulePaths: string[]): Promise<void>;
  clear(): void;
}

/**
 * Lazy Module Loader - Load dependencies only when needed
 * Sealed namespace for immutability
 */
export const LazyLoader = Object.freeze({
  /**
   * Create a new lazy loader instance
   */
  create(): ILazyLoader {
    const modules: Map<string, unknown> = new Map();

    return {
      /**
       * Lazy load a module
       */
      async load<T>(modulePath: string): Promise<T> {
        const cached = modules.get(modulePath);
        if (cached !== undefined) {
          return cached as T;
        }

        try {
          const module = await import(modulePath);
          modules.set(modulePath, module);
          return module as T;
        } catch (err) {
          throw ErrorFactory.createTryCatchError(`Failed to load module: ${modulePath}`, err);
        }
      },

      /**
       * Preload modules
       */
      async preload(modulePaths: string[]): Promise<void> {
        await Promise.all(modulePaths.map(async (path) => this.load(path)));
      },

      /**
       * Clear loaded modules
       */
      clear(): void {
        modules.clear();
      },
    };
  },
});

/**
 * Parallel Generator - Run multiple generators in parallel
 */

/**
 * Run generators in parallel batches
 */
export async function runBatch<T>(
  generators: Array<() => Promise<T>>,
  batchSize: number = 3
): Promise<T[]> {
  const batches: Array<Array<() => Promise<T>>> = [];
  for (let i = 0; i < generators.length; i += batchSize) {
    batches.push(generators.slice(i, i + batchSize));
  }

  return batches.reduce(
    async (accPromise, batch) => {
      const acc = await accPromise;
      const batchResults = await Promise.all(batch.map(async (gen) => gen()));
      return acc.concat(batchResults);
    },
    Promise.resolve([] as T[])
  );
}

/**
 * Run all generators in parallel
 */
export async function runAll<T>(generators: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(generators.map(async (gen) => gen()));
}

export const ParallelGenerator = Object.freeze({
  runBatch,
  runAll,
});

/**
 * Memoize - Cache function results based on arguments
 */

/**
 * Create a memoized version of a function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMemoized<T extends (...args: any[]) => any>(
  fn: T,
  options: { ttl?: number; keyGenerator?: (args: Parameters<T>) => string } = {}
): T {
  const cache = new Map<string, { result: ReturnType<T>; timestamp: number }>();

  return ((...args: Parameters<T>) => {
    const key =
      options.keyGenerator === undefined ? JSON.stringify(args) : options.keyGenerator(args);
    const entry = cache.get(key);

    if (entry !== undefined) {
      if (options.ttl === undefined || Date.now() - entry.timestamp < options.ttl) {
        return entry.result;
      }
      cache.delete(key);
    }

    const result = fn(...args) as ReturnType<T>;
    cache.set(key, { result, timestamp: Date.now() });
    return result;
  }) as unknown as T;
}

export const Memoize = Object.freeze({
  create: createMemoized,
});

export interface IPerformanceOptimizer {
  generateWithCache<T>(
    type: string,
    params: Record<string, unknown>,
    generatorFn: () => Promise<T>
  ): Promise<T>;
  generateInParallel<T>(generators: Array<() => Promise<T>>, batchSize?: number): Promise<T[]>;
  preloadModules(paths: string[]): Promise<void>;
  getStats(): {
    cacheHits: number;
    cacheMisses: number;
    hitRate: string;
    parallelRuns: number;
    estimatedSavedTime: string;
    cacheStatus: { size: number; keys: string[] };
  };
  saveCache(): void;
  clear(): void;
}

interface OptimizerStats {
  cacheHits: number;
  cacheMisses: number;
  parallelRuns: number;
  savedTime: number;
}

/**
 * Performance Optimizer - Wrapper for optimizations
 * Sealed namespace for immutability
 */
export const PerformanceOptimizer = Object.freeze({
  /**
   * Create a new performance optimizer instance
   */
  create(): IPerformanceOptimizer {
    const cache = GenerationCache.create();
    const lazyLoader = LazyLoader.create();
    const stats: OptimizerStats = {
      cacheHits: 0,
      cacheMisses: 0,
      parallelRuns: 0,
      savedTime: 0,
    };

    return {
      /**
       * Generate with caching
       */
      async generateWithCache<T>(
        type: string,
        params: Record<string, unknown>,
        generatorFn: () => Promise<T>
      ): Promise<T> {
        return generateWithCache(cache, stats, type, params, generatorFn);
      },

      /**
       * Generate multiple in parallel
       */
      async generateInParallel<T>(
        generators: Array<() => Promise<T>>,
        batchSize?: number
      ): Promise<T[]> {
        return generateInParallel(stats, generators, batchSize);
      },

      /**
       * Preload modules
       */
      async preloadModules(paths: string[]): Promise<void> {
        await lazyLoader.preload(paths);
      },

      /**
       * Get optimization statistics
       */
      getStats(): {
        cacheHits: number;
        cacheMisses: number;
        hitRate: string;
        parallelRuns: number;
        estimatedSavedTime: string;
        cacheStatus: { size: number; keys: string[] };
      } {
        return getOptimizerStats(cache, stats);
      },

      /**
       * Save cache to disk
       */
      saveCache(): void {
        cache.save();
      },

      /**
       * Clear everything
       */
      clear(): void {
        resetOptimizer(cache, lazyLoader, stats);
      },
    };
  },
});

/**
 * Reset optimizer state
 */
function resetOptimizer(
  cache: IGenerationCache,
  lazyLoader: ILazyLoader,
  stats: OptimizerStats
): void {
  cache.clear();
  lazyLoader.clear();
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.parallelRuns = 0;
  stats.savedTime = 0;
}

/**
 * Generate multiple in parallel
 */
async function generateInParallel<T>(
  stats: OptimizerStats,
  generators: Array<() => Promise<T>>,
  batchSize?: number
): Promise<T[]> {
  stats.parallelRuns++;
  if (batchSize !== undefined) {
    return ParallelGenerator.runBatch(generators, batchSize);
  }
  return ParallelGenerator.runAll(generators);
}

/**
 * Generate with caching
 */
async function generateWithCache<T>(
  cache: IGenerationCache,
  stats: OptimizerStats,
  type: string,
  params: Record<string, unknown>,
  generatorFn: () => Promise<T>
): Promise<T> {
  // Try cache
  const cached = cache.get(type, params);
  if (cached !== null) {
    stats.cacheHits++;
    return JSON.parse(cached) as T;
  }

  // Generate
  const startTime = performance.now();
  const result = await generatorFn();
  const duration = performance.now() - startTime;

  // Cache result
  cache.set(type, params, JSON.stringify(result));
  stats.cacheMisses++;
  stats.savedTime += duration;

  return result;
}

/**
 * Get optimization statistics
 */
function getOptimizerStats(
  cache: IGenerationCache,
  stats: OptimizerStats
): {
  cacheHits: number;
  cacheMisses: number;
  hitRate: string;
  parallelRuns: number;
  estimatedSavedTime: string;
  cacheStatus: { size: number; keys: string[] };
} {
  const total = stats.cacheHits + stats.cacheMisses;
  const hitRate = total > 0 ? (stats.cacheHits / total) * 100 : 0;

  return {
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    hitRate: `${hitRate.toFixed(1)}%`,
    parallelRuns: stats.parallelRuns,
    estimatedSavedTime: `${stats.savedTime.toFixed(2)}ms`,
    cacheStatus: cache.getStats(),
  };
}

export default PerformanceOptimizer;
