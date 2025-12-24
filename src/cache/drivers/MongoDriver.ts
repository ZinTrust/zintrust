/**
 * MongoDB Cache Driver
 * Uses MongoDB Atlas Data API (HTTPS) for zero-dependency integration
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * MongoDB Cache Driver
 * Uses MongoDB Atlas Data API (HTTPS) for zero-dependency integration
 * Sealed namespace for immutability
 */
export const MongoDriver = Object.freeze({
  /**
   * Create a new MongoDB driver instance
   */
  create(): CacheDriver {
    const uri = Env.MONGO_URI;
    const db = Env.MONGO_DB;
    const collection = 'cache';

    const request = async (action: string, body: Record<string, unknown>): Promise<unknown> => {
      if (uri === '') {
        Logger.warn('MONGO_URI not configured. MongoDB Cache request ignored.');
        return null;
      }

      try {
        const response = await fetch(`${uri}/action/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Request-Headers': '*',
          },
          body: JSON.stringify({
            dataSource: 'Cluster0',
            database: db,
            collection: collection,
            ...body,
          }),
        });

        return await response.json();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ErrorFactory.createTryCatchError(`MongoDB Cache Error: ${message}`);
        return null;
      }
    };

    return {
      async get<T>(key: string): Promise<T | null> {
        const result = (await request('findOne', { filter: { _id: key } })) as {
          document?: { value: T; expires: number | null };
        } | null;
        if (result?.document === undefined || result.document === null) return null;

        const doc = result.document;

        if (doc.expires !== null && doc.expires < Date.now()) {
          await this.delete(key);
          return null;
        }

        return doc.value;
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const expires = ttl === undefined ? null : Date.now() + ttl * 1000;
        await request('updateOne', {
          filter: { _id: key },
          update: { $set: { value, expires } },
          upsert: true,
        });
      },

      async delete(key: string): Promise<void> {
        await request('deleteOne', { filter: { _id: key } });
      },

      async clear(): Promise<void> {
        await request('deleteMany', { filter: {} });
      },

      async has(key: string): Promise<boolean> {
        const result = (await request('findOne', { filter: { _id: key } })) as {
          document?: unknown;
        } | null;
        return result?.document !== undefined && result.document !== null;
      },
    };
  },
});
