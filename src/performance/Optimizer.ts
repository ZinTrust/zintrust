/**
 * Performance Optimizations for Code Generation
 * Implements caching, lazy-loading, and parallel generation
 */

import { Logger } from '@config/logger';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Generation Cache - Cache generated code to avoid re-generating identical code
 */
export class GenerationCache {
  private readonly cache: Map<string, { code: string; timestamp: number }> = new Map();
  private readonly cacheDir: string;
  private readonly ttl: number; // Time to live in milliseconds

  constructor(cacheDir: string = path.join(process.cwd(), '.gen-cache'), ttlMs: number = 3600000) {
    this.cacheDir = cacheDir;
    this.ttl = ttlMs;
    this.loadFromDisk();
  }

  /**
   * Get cache key from params
   */
  private getCacheKey(type: string, params: Record<string, unknown>): string {
    const paramStr = JSON.stringify(params)
      .split('')
      .sort((a, b) => a.localeCompare(b))
      .join('');
    return `${type}:${Buffer.from(paramStr).toString('base64')}`;
  }

  /**
   * Get from cache
   */
  public get(type: string, params: Record<string, unknown>): string | null {
    const key = this.getCacheKey(type, params);
    const entry = this.cache.get(key);

    if (entry === undefined) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.code;
  }

  /**
   * Set in cache
   */
  public set(type: string, params: Record<string, unknown>, code: string): void {
    const key = this.getCacheKey(type, params);
    this.cache.set(key, {
      code,
      timestamp: Date.now(),
    });
  }

  /**
   * Load cache from disk
   */
  private loadFromDisk(): void {
    if (fs.existsSync(this.cacheDir) === true) {
      try {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json') === true) {
            const content = fs.readFileSync(path.join(this.cacheDir, file), 'utf-8');
            const data = JSON.parse(content);
            this.cache.set(file.replace('.json', ''), data);
          }
        }
      } catch (err) {
        Logger.error(
          `Failed to load cache from disk: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  /**
   * Save cache to disk
   */
  public save(): void {
    if (fs.existsSync(this.cacheDir) === false) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    for (const [key, entry] of this.cache.entries()) {
      const file = path.join(this.cacheDir, `${key}.json`);
      fs.writeFileSync(file, JSON.stringify(entry, null, 2));
    }
  }

  /**
   * Clear cache
   */
  public clear(): void {
    this.cache.clear();
    if (fs.existsSync(this.cacheDir) === true) {
      fs.rmSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    entries: number;
    diskUsage: string;
    keys: string[];
  } {
    let diskUsage = 0;
    if (fs.existsSync(this.cacheDir) === true) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        const stats = fs.statSync(path.join(this.cacheDir, file));
        diskUsage += stats.size;
      }
    }

    return {
      size: diskUsage,
      entries: this.cache.size,
      diskUsage: this.formatBytes(diskUsage),
      keys: Array.from(this.cache.keys()),
    };
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB'];
    let size = bytes;
    let i = 0;
    while (size > 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(2)} ${units[i]}`;
  }
}

/**
 * Lazy Module Loader - Load dependencies only when needed
 */
export class LazyLoader {
  private readonly modules: Map<string, unknown> = new Map();

  /**
   * Lazy load a module
   */
  public async load<T>(modulePath: string): Promise<T> {
    const cached = this.modules.get(modulePath);
    if (cached !== undefined) {
      return cached as T;
    }

    try {
      const module = await import(modulePath);
      this.modules.set(modulePath, module);
      return module as T;
    } catch (err) {
      Logger.error(
        `Failed to load module: ${modulePath}`,
        err instanceof Error ? err : new Error(String(err))
      );
      throw new Error(`Failed to load module: ${modulePath}`);
    }
  }

  /**
   * Preload modules
   */
  public async preload(modulePaths: string[]): Promise<void> {
    await Promise.all(modulePaths.map((path) => this.load(path)));
  }

  /**
   * Clear loaded modules
   */
  public clear(): void {
    this.modules.clear();
  }
}

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
  const results: T[] = [];

  for (let i = 0; i < generators.length; i += batchSize) {
    const batch = generators.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((gen) => gen()));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Run all generators in parallel
 */
export async function runAll<T>(generators: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(generators.map((gen) => gen()));
}

export const ParallelGenerator = {
  runBatch,
  runAll,
};

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

export const Memoize = {
  create: createMemoized,
};

/**
 * Performance Optimizer - Wrapper for optimizations
 */
export class PerformanceOptimizer {
  private readonly cache: GenerationCache;
  private readonly lazyLoader: LazyLoader;
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    parallelRuns: 0,
    savedTime: 0,
  };

  constructor() {
    this.cache = new GenerationCache();
    this.lazyLoader = new LazyLoader();
  }

  /**
   * Generate with caching
   */
  public async generateWithCache<T>(
    type: string,
    params: Record<string, unknown>,
    generatorFn: () => Promise<T>
  ): Promise<T> {
    // Try cache
    const cached = this.cache.get(type, params);
    if (cached !== null) {
      this.stats.cacheHits++;
      return JSON.parse(cached) as T;
    }

    // Generate
    const startTime = performance.now();
    const result = await generatorFn();
    const duration = performance.now() - startTime;

    // Cache result
    this.cache.set(type, params, JSON.stringify(result));
    this.stats.cacheMisses++;
    this.stats.savedTime += duration;

    return result;
  }

  /**
   * Generate multiple in parallel
   */
  public async generateInParallel<T>(
    generators: Array<() => Promise<T>>,
    batchSize?: number
  ): Promise<T[]> {
    this.stats.parallelRuns++;
    if (batchSize !== undefined) {
      return ParallelGenerator.runBatch(generators, batchSize);
    }
    return ParallelGenerator.runAll(generators);
  }

  /**
   * Preload modules
   */
  public async preloadModules(paths: string[]): Promise<void> {
    await this.lazyLoader.preload(paths);
  }

  /**
   * Get optimization statistics
   */
  public getStats(): {
    cacheHits: number;
    cacheMisses: number;
    hitRate: string;
    parallelRuns: number;
    estimatedSavedTime: string;
    cacheStatus: { size: number; keys: string[] };
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = total > 0 ? (this.stats.cacheHits / total) * 100 : 0;

    return {
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hitRate: `${hitRate.toFixed(1)}%`,
      parallelRuns: this.stats.parallelRuns,
      estimatedSavedTime: `${this.stats.savedTime.toFixed(2)}ms`,
      cacheStatus: this.cache.getStats(),
    };
  }

  /**
   * Save cache to disk
   */
  public saveCache(): void {
    this.cache.save();
  }

  /**
   * Clear everything
   */
  public clear(): void {
    this.cache.clear();
    this.lazyLoader.clear();
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      parallelRuns: 0,
      savedTime: 0,
    };
  }
}

export default PerformanceOptimizer;
