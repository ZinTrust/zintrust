/**
 * MongoDB Cache Driver
 * Uses MongoDB Atlas Data API (HTTPS) for zero-dependency integration
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

export class MongoDriver implements CacheDriver {
  private readonly uri: string;
  private readonly db: string;
  private readonly collection = 'cache';

  constructor() {
    this.uri = Env.MONGO_URI;
    this.db = Env.MONGO_DB;
  }

  private async request(action: string, body: Record<string, unknown>): Promise<unknown> {
    if (this.uri === '') {
      Logger.warn('MONGO_URI not configured. MongoDB Cache request ignored.');
      return null;
    }

    try {
      const response = await fetch(`${this.uri}/action/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Request-Headers': '*',
        },
        body: JSON.stringify({
          dataSource: 'Cluster0',
          database: this.db,
          collection: this.collection,
          ...body,
        }),
      });

      return await response.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`MongoDB Cache Error: ${message}`);
      return null;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    const result = (await this.request('findOne', { filter: { _id: key } })) as {
      document?: { value: T; expires: number | null };
    } | null;
    if (result?.document === undefined || result.document === null) return null;

    const doc = result.document;

    if (doc.expires !== null && doc.expires < Date.now()) {
      await this.delete(key);
      return null;
    }

    return doc.value;
  }

  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expires = ttl === undefined ? null : Date.now() + ttl * 1000;
    await this.request('updateOne', {
      filter: { _id: key },
      update: { $set: { value, expires } },
      upsert: true,
    });
  }

  public async delete(key: string): Promise<void> {
    await this.request('deleteOne', { filter: { _id: key } });
  }

  public async clear(): Promise<void> {
    await this.request('deleteMany', { filter: {} });
  }

  public async has(key: string): Promise<boolean> {
    const result = (await this.request('findOne', { filter: { _id: key } })) as {
      document?: unknown;
    } | null;
    return result?.document !== undefined && result.document !== null;
  }
}
