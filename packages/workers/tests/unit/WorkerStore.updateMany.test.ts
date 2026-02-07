import { describe, expect, it, vi } from 'vitest';

import {
  DbWorkerStore,
  InMemoryWorkerStore,
  type WorkerRecord,
} from '../../src/storage/WorkerStore';

const buildRecord = (overrides: Partial<WorkerRecord> = {}): WorkerRecord => ({
  name: overrides.name ?? 'worker-1',
  queueName: overrides.queueName ?? 'queue',
  version: overrides.version ?? '1.0.0',
  status: overrides.status ?? 'running',
  autoStart: overrides.autoStart ?? false,
  concurrency: overrides.concurrency ?? 1,
  region: overrides.region ?? null,
  features: overrides.features ?? null,
  infrastructure: overrides.infrastructure ?? null,
  datacenter: overrides.datacenter ?? null,
  createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
  lastHealthCheck: overrides.lastHealthCheck,
  lastError: overrides.lastError,
  connectionState: overrides.connectionState,
});

describe('WorkerStore updateMany', () => {
  it('updates multiple records in memory store', async () => {
    const store = InMemoryWorkerStore.create();
    await store.save(buildRecord({ name: 'w1', status: 'running' }));
    await store.save(buildRecord({ name: 'w2', status: 'running' }));

    await store.updateMany?.(['w1', 'w2'], { status: 'stopped' });

    const r1 = await store.get('w1');
    const r2 = await store.get('w2');
    expect(r1?.status).toBe('stopped');
    expect(r2?.status).toBe('stopped');
  });

  it('updates multiple records in db store using whereIn', async () => {
    const updateSpy = vi.fn(async () => undefined);
    const whereInSpy = vi.fn((_col: string, _vals: string[]) => ({ update: updateSpy }));
    const tableSpy = vi.fn(() => ({ whereIn: whereInSpy }));

    const db = { table: tableSpy } as unknown as import('@zintrust/core').IDatabase;
    const store = DbWorkerStore.create(db, 'zintrust_workers');

    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    await store.updateMany?.(['w1', 'w2'], { status: 'stopped', updatedAt });

    expect(tableSpy).toHaveBeenCalledWith('zintrust_workers');
    expect(whereInSpy).toHaveBeenCalledWith('name', ['w1', 'w2']);
    expect(updateSpy).toHaveBeenCalledWith({
      updated_at: updatedAt,
      status: 'stopped',
    });
  });
});
