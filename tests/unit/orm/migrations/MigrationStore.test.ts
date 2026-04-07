import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const qb = {
    max: vi.fn(() => qb),
    select: vi.fn(() => qb),
    selectAs: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    limit: vi.fn(() => qb),
    first: vi.fn(async () => null),
    get: vi.fn(async () => []),
    update: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };

  return {
    qb,
    create: vi.fn(() => qb),
  };
});

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: (...args: any[]) => mocked.create(...args),
  },
}));

describe('MigrationStore', () => {
  it('ensureTable rejects d1 and rejects adapters without migrations table support', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const d1Db = {
      getType: () => 'd1',
      getAdapterInstance: () => ({}),
    } as any;
    await expect(MigrationStore.ensureTable(d1Db)).rejects.toThrow(/configured for D1/i);

    const unsupportedDb = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({}),
    } as any;
    await expect(MigrationStore.ensureTable(unsupportedDb)).rejects.toThrow(/not supported/i);
  });

  it('ensureTable calls adapter.ensureMigrationsTable when available', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const ensureMigrationsTable = vi.fn(async () => undefined);
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable }),
    } as any;

    await MigrationStore.ensureTable(db);
    expect(ensureMigrationsTable).toHaveBeenCalledTimes(1);
  });

  it('ensureTable attempts to connect via db.connect or adapter.connect when available', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const ensureMigrationsTable = vi.fn(async () => undefined);
    const dbConnect = vi.fn(async () => undefined);
    const db1 = {
      getType: () => 'postgresql',
      connect: dbConnect,
      getAdapterInstance: () => ({ ensureMigrationsTable }),
    } as any;

    await MigrationStore.ensureTable(db1);
    expect(dbConnect).toHaveBeenCalledTimes(1);

    const adapterConnect = vi.fn(async () => undefined);
    const db2 = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ connect: adapterConnect, ensureMigrationsTable }),
    } as any;

    await MigrationStore.ensureTable(db2);
    expect(adapterConnect).toHaveBeenCalledTimes(1);
  });

  it('getLastCompletedBatch returns 0 when max_batch is not a finite number', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    mocked.qb.first.mockResolvedValueOnce({ max_batch: '7' });
    await expect(MigrationStore.getLastCompletedBatch(db, 'global', 'svc')).resolves.toBe(0);

    mocked.qb.first.mockResolvedValueOnce({ max_batch: 7 });
    await expect(MigrationStore.getLastCompletedBatch(db, 'global', 'svc')).resolves.toBe(7);
  });

  it('getAppliedMap filters invalid names and normalizes service values', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    mocked.qb.get.mockResolvedValueOnce([
      {
        name: 'm1',
        scope: 'global',
        service: null,
        batch: 1,
        status: 'completed',
        appliedAt: null,
      },
      { name: '', scope: 'global', service: 'x', batch: 1, status: 'completed', appliedAt: null },
    ]);

    const map = await MigrationStore.getAppliedMap(db, 'global' as any, '');
    expect(map.size).toBe(1);
    expect(map.get('m1')).toEqual(expect.objectContaining({ name: 'm1', service: '' }));
  });

  it('insertRunning updates existing rows or inserts new rows', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    mocked.qb.first.mockResolvedValueOnce({ id: 123 });
    await MigrationStore.insertRunning(db, {
      name: 'm1',
      scope: 'global' as any,
      service: '',
      batch: 2,
    });
    expect(mocked.qb.update).toHaveBeenCalledWith(
      expect.objectContaining({ batch: 2, status: 'running', applied_at: null })
    );

    mocked.qb.first.mockResolvedValueOnce(null);
    await MigrationStore.insertRunning(db, {
      name: 'm2',
      scope: 'global' as any,
      service: '',
      batch: 3,
    });
    expect(mocked.qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'm2', status: 'running', created_at: expect.any(String) })
    );
  });

  it('markStatus updates with or without appliedAt', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    await MigrationStore.markStatus(db, {
      name: 'm1',
      scope: 'global' as any,
      service: '',
      status: 'completed' as any,
      appliedAt: '2026-01-01 00:00:00',
    });
    expect(mocked.qb.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', applied_at: '2026-01-01 00:00:00' })
    );

    await MigrationStore.markStatus(db, {
      name: 'm2',
      scope: 'global' as any,
      service: '',
      status: 'failed' as any,
    });
    expect(mocked.qb.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('listCompletedInBatchesGte filters invalid rows and coerces batch', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    mocked.qb.get.mockResolvedValueOnce([
      { name: 'm1', batch: '2' },
      { name: '', batch: 2 },
      { name: 'm2', batch: 'nope' },
    ]);

    const rows = await MigrationStore.listCompletedInBatchesGte(db, {
      scope: 'global' as any,
      service: '',
      minBatch: 1,
    });

    expect(rows).toEqual([{ name: 'm1', batch: 2 }]);
  });

  it('listAllCompletedNames filters empty names and deleteRecord calls delete', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    mocked.qb.get.mockResolvedValueOnce([{ name: 'm1' }, { name: 1 }, { name: '' }]);
    await expect(
      MigrationStore.listAllCompletedNames(db, { scope: 'global' as any, service: '' })
    ).resolves.toEqual(['m1']);

    await MigrationStore.deleteRecord(db, { name: 'm1', scope: 'global' as any, service: '' });
    expect(mocked.qb.delete).toHaveBeenCalledTimes(1);
  });

  it('supports legacy migrations tables that still require the migration column', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const schemaColumns = new Set(['id', 'name', 'migration', 'batch']);
    const query = vi.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('information_schema.columns')) {
        const columnName = String(parameters[1] ?? '');
        return schemaColumns.has(columnName) ? [{ ok: 1 }] : [];
      }

      if (sql.startsWith('SELECT id FROM migrations')) {
        return [];
      }

      if (sql.startsWith('SELECT name, migration, batch FROM migrations')) {
        return [{ migration: '20260331000001_create_zin_trace_entries_table', batch: 4 }];
      }

      return [];
    });
    const execute = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const db = {
      execute,
      getType: () => 'mysql',
      query,
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    await MigrationStore.insertRunning(db, {
      name: '20260331000001_create_zin_trace_entries_table',
      scope: 'global' as any,
      service: '',
      batch: 4,
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO migrations (name, migration, batch)'),
      [
        '20260331000001_create_zin_trace_entries_table',
        '20260331000001_create_zin_trace_entries_table',
        4,
      ]
    );

    const appliedMap = await MigrationStore.getAppliedMap(db, 'global' as any, '');
    expect(appliedMap.get('20260331000001_create_zin_trace_entries_table')).toEqual(
      expect.objectContaining({ status: 'completed', batch: 4 })
    );
  });

  it('rejects service-scoped tracking against legacy migrations tables', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const schemaColumns = new Set(['id', 'migration', 'batch']);
    const db = {
      getType: () => 'mysql',
      query: vi.fn(async (_sql: string, parameters: unknown[]) => {
        const columnName = String(parameters[1] ?? '');
        return schemaColumns.has(columnName) ? [{ ok: 1 }] : [];
      }),
      getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
    } as any;

    await expect(MigrationStore.getAppliedMap(db, 'service' as any, 'trace')).rejects.toThrow(
      /legacy schema/i
    );
  });
});
