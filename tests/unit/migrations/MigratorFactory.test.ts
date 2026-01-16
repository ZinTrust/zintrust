import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@migrations/MigrationDiscovery', () => ({
  MigrationDiscovery: {
    resolveDir: vi.fn((root: string, dir: string) => path.join(root, dir)),
    listMigrationFiles: vi.fn(),
  },
}));

vi.mock('@migrations/MigrationLoader', () => ({
  MigrationLoader: {
    load: vi.fn(),
  },
}));

vi.mock('@migrations/MigrationLock', () => ({
  MigrationLock: {
    acquire: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@orm/migrations/MigrationStore', () => ({
  MigrationStore: {
    ensureTable: vi.fn(),
    getAppliedMap: vi.fn(),
    getLastCompletedBatch: vi.fn(),
    insertRunning: vi.fn(),
    markStatus: vi.fn(),
    listCompletedInBatchesGte: vi.fn(),
    listAllCompletedNames: vi.fn(),
    deleteRecord: vi.fn(),
  },
}));

vi.mock('@orm/maintenance/SqliteMaintenance', () => ({
  SqliteMaintenance: {
    dropAllTables: vi.fn(),
  },
}));

describe('MigratorFactory', () => {
  const projectRoot = '/project';

  const makeDb = () => ({
    getType: vi.fn(() => 'postgresql'),
    transaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('tracks service-scoped migrations and status output', async () => {
    const { MigrationDiscovery } = await import('@migrations/MigrationDiscovery');
    const { MigrationLoader } = await import('@migrations/MigrationLoader');
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const { MigratorFactory } = await import('@/migrations/MigratorFactory');

    const globalFile = path.join(projectRoot, 'database/migrations/20240101000000_global.ts');
    const serviceFile = path.join(
      projectRoot,
      'services/billing/database/migrations/20240101000001_service.ts'
    );

    vi.mocked(MigrationDiscovery.listMigrationFiles).mockReturnValue([globalFile, serviceFile]);
    vi.mocked(MigrationLoader.load).mockImplementation(async (file: string) => ({
      name: path.basename(file).replace('.ts', ''),
      filePath: file,
      up: vi.fn(),
      down: vi.fn(),
    }));

    const appliedGlobal = new Map([
      [
        '20240101000000_global',
        {
          name: '20240101000000_global',
          status: 'completed' as const,
          batch: 1,
          scope: 'global' as const,
          service: '',
          appliedAt: new Date().toISOString(),
        },
      ],
    ]);
    const appliedService = new Map([
      [
        '20240101000001_service',
        {
          name: '20240101000001_service',
          status: 'completed' as const,
          batch: 2,
          scope: 'service' as const,
          service: 'billing',
          appliedAt: new Date().toISOString(),
        },
      ],
    ]);

    vi.mocked(MigrationStore.getAppliedMap).mockImplementation(
      async (_db: unknown, scope: string) => (scope === 'service' ? appliedService : appliedGlobal)
    );

    const migrator = MigratorFactory.create({
      db: makeDb() as any,
      projectRoot,
      globalDir: 'database/migrations',
      extension: '.ts',
      separateTracking: true,
      includeGlobal: true,
      service: 'billing',
    });

    const status = await migrator.status();

    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '20240101000000_global', applied: true }),
        expect.objectContaining({ name: '20240101000001_service', applied: true }),
      ])
    );
  });

  it('skips pending migrations with already-applied suffixes', async () => {
    const { MigrationDiscovery } = await import('@migrations/MigrationDiscovery');
    const { MigrationLoader } = await import('@migrations/MigrationLoader');
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const { MigratorFactory } = await import('@/migrations/MigratorFactory');

    const migrationFile = path.join(
      projectRoot,
      'database/migrations/20250101000000_create_users.ts'
    );

    vi.mocked(MigrationDiscovery.listMigrationFiles).mockReturnValue([migrationFile]);
    vi.mocked(MigrationLoader.load).mockResolvedValue({
      name: '20250101000000_create_users',
      filePath: migrationFile,
      up: vi.fn(),
      down: vi.fn(),
    });

    vi.mocked(MigrationStore.getAppliedMap).mockResolvedValue(
      new Map([
        [
          '20240101000000_create_users',
          {
            name: '20240101000000_create_users',
            status: 'completed' as const,
            batch: 1,
            scope: 'global' as const,
            service: '',
            appliedAt: new Date().toISOString(),
          },
        ],
      ])
    );
    vi.mocked(MigrationStore.getLastCompletedBatch).mockResolvedValue(1);

    const migrator = MigratorFactory.create({
      db: makeDb() as any,
      projectRoot,
      globalDir: 'database/migrations',
      extension: '.ts',
    });

    const result = await migrator.migrate();

    expect(result).toEqual({ applied: 0, pending: 0, appliedNames: [] });
  });

  it('throws when rolling back with missing migration files', async () => {
    const { MigrationDiscovery } = await import('@migrations/MigrationDiscovery');
    const { MigrationLoader } = await import('@migrations/MigrationLoader');
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const { MigratorFactory } = await import('@/migrations/MigratorFactory');

    vi.mocked(MigrationDiscovery.listMigrationFiles).mockReturnValue([]);
    vi.mocked(MigrationLoader.load).mockImplementation(async (file: string) => ({
      name: path.basename(file).replace('.ts', ''),
      filePath: file,
      up: vi.fn(),
      down: vi.fn(),
    }));

    vi.mocked(MigrationStore.getLastCompletedBatch).mockResolvedValue(2);
    vi.mocked(MigrationStore.listCompletedInBatchesGte).mockResolvedValue([
      { name: '20240101000000_missing', scope: 'global' as const, service: '', batch: 1 } as any,
    ]);

    const migrator = MigratorFactory.create({
      db: makeDb() as any,
      projectRoot,
      globalDir: 'database/migrations',
      extension: '.ts',
    });

    await expect(migrator.rollbackLastBatch(1)).rejects.toThrow(/migration file is missing/i);
  });

  it('drops sqlite tables during fresh and applies migrations', async () => {
    const { MigrationDiscovery } = await import('@migrations/MigrationDiscovery');
    const { MigrationLoader } = await import('@migrations/MigrationLoader');
    const { MigrationStore } = await import('@orm/migrations/MigrationStore');
    const { SqliteMaintenance } = await import('@orm/maintenance/SqliteMaintenance');
    const { MigratorFactory } = await import('@/migrations/MigratorFactory');

    const db = {
      getType: vi.fn(() => 'sqlite'),
      transaction: vi.fn(async (fn: () => Promise<void>) => fn()),
    } as any;

    const migrationFile = path.join(
      projectRoot,
      'database/migrations/20250101000000_create_items.ts'
    );
    vi.mocked(MigrationDiscovery.listMigrationFiles).mockReturnValue([migrationFile]);
    vi.mocked(MigrationLoader.load).mockResolvedValue({
      name: '20250101000000_create_items',
      filePath: migrationFile,
      up: vi.fn(),
      down: vi.fn(),
    });

    vi.mocked(MigrationStore.getAppliedMap).mockResolvedValue(new Map());
    vi.mocked(MigrationStore.getLastCompletedBatch).mockResolvedValue(0);
    vi.mocked(MigrationStore.insertRunning).mockResolvedValue(undefined);
    vi.mocked(MigrationStore.markStatus).mockResolvedValue(undefined);

    const migrator = MigratorFactory.create({
      db,
      projectRoot,
      globalDir: 'database/migrations',
      extension: '.ts',
    });

    const result = await migrator.fresh();

    expect(SqliteMaintenance.dropAllTables).toHaveBeenCalled();
    expect(result.applied).toBe(1);
    expect(result.appliedNames).toEqual(['20250101000000_create_items']);
  });
});
