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

const createLegacyDb = (
  driver: string,
  schemaColumns: string[],
  handlers: {
    onQuery?: (sql: string, parameters: unknown[]) => Promise<unknown[]> | unknown[];
    onExecute?: (sql: string, parameters: unknown[]) => Promise<unknown> | unknown;
  } = {}
) => {
  const columnSet = new Set(schemaColumns);
  const query = vi.fn(async (sql: string, parameters: unknown[]) => {
    if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') {
      if (sql.startsWith('PRAGMA table_info("migrations")')) {
        return schemaColumns.map((name) => ({ name }));
      }
    } else if (sql.includes('information_schema.columns') || sql.includes('sys.columns')) {
      const columnName = String(parameters[1] ?? '');
      return columnSet.has(columnName) ? [{ ok: 1 }] : [];
    }

    if (handlers.onQuery) return handlers.onQuery(sql, parameters);
    return [];
  });

  const execute = vi.fn(async (sql: string, parameters: unknown[]) => {
    if (handlers.onExecute) return handlers.onExecute(sql, parameters);
    return { rows: [], rowCount: 1 };
  });

  return {
    execute,
    getType: () => driver,
    query,
    getAdapterInstance: () => ({ ensureMigrationsTable: vi.fn() }),
  } as any;
};

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

  it('supports sqlite legacy tracking updates and batch reads through PRAGMA schema probing', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const db = createLegacyDb('sqlite', ['migration', 'batch', 'applied_at'], {
      onQuery: async (sql: string) => {
        if (sql.startsWith('SELECT migration, batch, applied_at FROM migrations')) {
          return [
            { migration: 'm1', batch: '2', applied_at: '2026-04-07 00:00:00' },
            { migration: 'm2', batch: 4, applied_at: null },
          ];
        }

        if (sql.startsWith('SELECT id FROM migrations')) {
          return [{ id: 10 }];
        }

        return [];
      },
    });

    await expect(MigrationStore.getLastCompletedBatch(db, 'global' as any, '')).resolves.toBe(4);

    await MigrationStore.insertRunning(db, {
      name: 'm2',
      scope: 'global' as any,
      service: '',
      batch: 5,
    });

    expect(db.execute).toHaveBeenCalledWith(
      'UPDATE migrations SET batch = ?, applied_at = ? WHERE migration = ?',
      [5, null, 'm2']
    );
  });

  it('supports postgres legacy name-based layouts and defaults missing status to completed', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const db = createLegacyDb('postgresql', ['name', 'batch', 'scope', 'service', 'applied_at'], {
      onQuery: async (sql: string, parameters: unknown[]) => {
        if (sql.startsWith('SELECT name, batch, applied_at FROM migrations')) {
          expect(parameters).toEqual(['global', 'trace']);
          return [
            { name: 'm3', batch: 7, applied_at: '2026-04-07 01:00:00' },
            { name: '', batch: 9, applied_at: null },
          ];
        }

        return [];
      },
    });

    const appliedMap = await MigrationStore.getAppliedMap(db, 'global' as any, 'trace');
    expect(appliedMap.get('m3')).toEqual(
      expect.objectContaining({
        appliedAt: '2026-04-07 01:00:00',
        batch: 7,
        name: 'm3',
        service: 'trace',
        status: 'completed',
      })
    );

    await expect(
      MigrationStore.listCompletedInBatchesGte(db, {
        scope: 'global' as any,
        service: 'trace',
        minBatch: 1,
      })
    ).resolves.toEqual([{ name: 'm3', batch: 7 }]);
  });

  it('supports sqlserver legacy inserts with mixed name and migration identity columns', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const db = createLegacyDb(
      'sqlserver',
      ['name', 'migration', 'scope', 'service', 'batch', 'status', 'applied_at', 'created_at'],
      {
        onQuery: async (sql: string) => {
          if (sql.startsWith('SELECT id FROM migrations')) {
            return [];
          }

          return [];
        },
      }
    );

    await MigrationStore.insertRunning(db, {
      name: 'm4',
      scope: 'global' as any,
      service: '',
      batch: 8,
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO migrations (name, migration, scope, service, batch, status, applied_at, created_at)'
      ),
      ['m4', 'm4', 'global', '', 8, 'running', null, expect.any(String)]
    );

    await MigrationStore.markStatus(db, {
      name: 'm4',
      scope: 'global' as any,
      service: '',
      status: 'completed' as any,
      appliedAt: '2026-04-07 02:00:00',
    });

    expect(db.execute).toHaveBeenLastCalledWith(
      'UPDATE migrations SET status = ?, applied_at = ? WHERE (name = ? OR migration = ?) AND scope = ? AND service = ?',
      ['completed', '2026-04-07 02:00:00', 'm4', 'm4', 'global', '']
    );
  });

  it('rejects layouts missing both tracking name columns and unsupported schema-probe drivers', async () => {
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');

    const missingColumnsDb = createLegacyDb('mysql', ['batch']);
    await expect(MigrationStore.getAppliedMap(missingColumnsDb, 'global' as any, '')).rejects.toThrow(
      /missing both `name` and `migration` columns/i
    );

    const unsupportedDriverDb = createLegacyDb('oracle', ['name']);
    await expect(MigrationStore.getAppliedMap(unsupportedDriverDb, 'global' as any, '')).rejects.toThrow(
      /Unsupported DB driver: oracle/
    );
  });
});
