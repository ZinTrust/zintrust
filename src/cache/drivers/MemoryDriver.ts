/**
 * Memory Cache Driver
 * Simple in-memory storage for local development
 */

import { CacheDriver } from '@cache/CacheDriver';

export class MemoryDriver implements CacheDriver {
  private readonly storage = new Map<string, { value: unknown; expires: number | null }>();

  public async get<T>(key: string): Promise<T | null> {
    const item = this.storage.get(key);
    if (item === undefined) return null;

    if (item.expires !== null && item.expires < Date.now()) {
      this.storage.delete(key);
      return null;
    }

    return item.value as T;
  }

  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expires = ttl === undefined ? null : Date.now() + ttl * 1000;
    this.storage.set(key, { value, expires });
  }

  public async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  public async clear(): Promise<void> {
    this.storage.clear();
  }

  public async has(key: string): Promise<boolean> {
    const item = this.storage.get(key);
    if (item === undefined) return false;

    if (item.expires !== null && item.expires < Date.now()) {
      this.storage.delete(key);
      return false;
    }

    return true;
  }
}
