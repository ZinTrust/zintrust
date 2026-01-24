/**
 * Worker Store
 * Persistence layer for workers (memory, redis, db)
 */

import type { IDatabase } from '@zintrust/core';
import type { Redis } from 'ioredis';

export type WorkerRecord = {
  name: string;
  queueName: string;
  version: string | null;
  status: string;
  autoStart: boolean;
  concurrency: number;
  region: string | null;
  processorPath?: string | null;
  features?: Record<string, unknown> | null;
  infrastructure?: Record<string, unknown> | null;
  datacenter?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheck?: Date;
  lastError?: string;
  connectionState?: 'disconnected' | 'connecting' | 'connected' | 'error';
};

export type WorkerStore = {
  init(): Promise<void>;
  list(): Promise<WorkerRecord[]>;
  get(name: string): Promise<WorkerRecord | null>;
  save(record: WorkerRecord): Promise<void>;
  update(name: string, patch: Partial<WorkerRecord>): Promise<void>;
  remove(name: string): Promise<void>;
};

const now = (): Date => new Date();

const mergeRecord = (current: WorkerRecord, patch: Partial<WorkerRecord>): WorkerRecord => ({
  ...current,
  ...patch,
  updatedAt: patch.updatedAt ?? now(),
});

const serializeDbWorker = (record: WorkerRecord): Record<string, unknown> => ({
  name: record.name,
  queue_name: record.queueName,
  version: record.version,
  status: record.status,
  auto_start: record.autoStart,
  concurrency: record.concurrency,
  region: record.region,
  processor_path: record.processorPath ?? null,
  features: record.features ? JSON.stringify(record.features) : null,
  infrastructure: record.infrastructure ? JSON.stringify(record.infrastructure) : null,
  datacenter: record.datacenter ? JSON.stringify(record.datacenter) : null,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
  last_health_check: record.lastHealthCheck,
  last_error: record.lastError,
  connection_state: record.connectionState,
});

const getHealthCheck = (row: Record<string, unknown>): Date | undefined => {
  if (!row['last_health_check']) {
    return undefined;
  }
  return row['last_health_check'] instanceof Date
    ? row['last_health_check']
    : new Date(String(row['last_health_check']));
};

const deserializeDbWorker = (row: Record<string, unknown>): WorkerRecord => {
  const parseJson = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== 'string' || value.trim() === '') return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return {
    name: String(row['name'] ?? ''),
    queueName: String(row['queue_name'] ?? ''),
    version: row['version'] ? String(row['version']) : null,
    status: String(row['status'] ?? 'unknown'),
    autoStart: Boolean(row['auto_start'] ?? false),
    concurrency: Number(row['concurrency'] ?? 0),
    region: row['region'] ? String(row['region']) : null,
    processorPath: row['processor_path'] ? String(row['processor_path']) : null,
    features: parseJson(row['features']),
    infrastructure: parseJson(row['infrastructure']),
    datacenter: parseJson(row['datacenter']),
    createdAt:
      row['created_at'] instanceof Date ? row['created_at'] : new Date(String(row['created_at'])),
    updatedAt:
      row['updated_at'] instanceof Date ? row['updated_at'] : new Date(String(row['updated_at'])),
    lastHealthCheck: getHealthCheck(row),
    lastError: row['last_error'] ? String(row['last_error']) : undefined,
    connectionState: row['connection_state']
      ? (String(row['connection_state']) as 'disconnected' | 'connecting' | 'connected' | 'error')
      : undefined,
  };
};

export const InMemoryWorkerStore = Object.freeze({
  create(): WorkerStore {
    const store = new Map<string, WorkerRecord>();

    return {
      async init(): Promise<void> {
        return undefined;
      },
      async list(): Promise<WorkerRecord[]> {
        return Array.from(store.values());
      },
      async get(name: string): Promise<WorkerRecord | null> {
        return store.get(name) ?? null;
      },
      async save(record: WorkerRecord): Promise<void> {
        store.set(record.name, record);
      },
      async update(name: string, patch: Partial<WorkerRecord>): Promise<void> {
        const current = store.get(name);
        if (!current) return;
        store.set(name, mergeRecord(current, patch));
      },
      async remove(name: string): Promise<void> {
        store.delete(name);
      },
    };
  },
});

export const RedisWorkerStore = Object.freeze({
  create(client: Redis, keyPrefix = 'workers:registry'): WorkerStore {
    const key = keyPrefix;

    const serialize = (record: WorkerRecord): string =>
      JSON.stringify({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      });

    const deserialize = (raw: string): WorkerRecord => {
      const parsed = JSON.parse(raw) as Omit<WorkerRecord, 'createdAt' | 'updatedAt'> & {
        createdAt: string;
        updatedAt: string;
      };
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      };
    };

    return {
      async init(): Promise<void> {
        return undefined;
      },
      async list(): Promise<WorkerRecord[]> {
        const all = await client.hgetall(key);
        return Object.values(all).map(deserialize);
      },
      async get(name: string): Promise<WorkerRecord | null> {
        const raw = await client.hget(key, name);
        return raw ? deserialize(raw) : null;
      },
      async save(record: WorkerRecord): Promise<void> {
        await client.hset(key, record.name, serialize(record));
      },
      async update(name: string, patch: Partial<WorkerRecord>): Promise<void> {
        const current = await this.get(name);
        if (!current) return;
        await client.hset(key, name, serialize(mergeRecord(current, patch)));
      },
      async remove(name: string): Promise<void> {
        await client.hdel(key, name);
      },
    };
  },
});

export const DbWorkerStore = Object.freeze({
  create(db: IDatabase, table = 'zintrust_workers'): WorkerStore {
    return {
      async init(): Promise<void> {
        return undefined;
      },
      async list(): Promise<WorkerRecord[]> {
        const rows = await db.table(table).get<Record<string, unknown>>();
        return rows.map(deserializeDbWorker);
      },
      async get(name: string): Promise<WorkerRecord | null> {
        const row = await db.table(table).where('name', '=', name).first<Record<string, unknown>>();
        return row ? deserializeDbWorker(row) : null;
      },
      async save(record: WorkerRecord): Promise<void> {
        const existing = await db
          .table(table)
          .where('name', '=', record.name)
          .first<Record<string, unknown>>();

        if (existing) {
          await db.table(table).where('name', '=', record.name).update(serializeDbWorker(record));
          return;
        }

        await db.table(table).insert(serializeDbWorker(record));
      },
      async update(name: string, patch: Partial<WorkerRecord>): Promise<void> {
        const current = await this.get(name);
        if (!current) return;
        const updated = mergeRecord(current, patch);
        await db.table(table).where('name', '=', name).update(serializeDbWorker(updated));
      },
      async remove(name: string): Promise<void> {
        await db.table(table).where('name', '=', name).delete();
      },
    };
  },
});
