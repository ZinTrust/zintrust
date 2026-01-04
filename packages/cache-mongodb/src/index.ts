import { Logger } from '@zintrust/core';

// Minimal interface to avoid importing internal core types
export interface CacheDriver {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

export type MongoCacheConfig = {
  driver: 'mongodb';
  uri: string;
  db: string;
  ttl: number;
};

export const MongoCacheDriver = Object.freeze({
  create(config: MongoCacheConfig): CacheDriver {
    const uri = String(config.uri ?? '').trim();
    const db = String(config.db ?? '').trim();
    const collection = 'cache';

    const request = async (action: string, body: Record<string, unknown>): Promise<unknown> => {
      if (uri === '') {
        Logger.warn('MongoDB cache driver missing uri. Request ignored.');
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
        Logger.warn('MongoDB cache request failed', { message, action });
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
        const effectiveTtl = ttl ?? config.ttl;
        const expires = effectiveTtl === undefined ? null : Date.now() + effectiveTtl * 1000;
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

export default MongoCacheDriver;
