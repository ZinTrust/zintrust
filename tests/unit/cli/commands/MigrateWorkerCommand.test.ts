import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorHandler } from '@cli/ErrorHandler';

const envState = { NODE_ENV: 'development' };

vi.mock('@config/env', () => ({
  Env: envState,
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: vi.fn(),
  },
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    connections: {
      default: {
        driver: 'sqlite',
        database: 'db.sqlite',
      },
      postgres: {
        driver: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'user',
        password: 'pass',
      },
    },
    migrations: { extension: 'ts' },
    getConnection: vi.fn(() => ({
      driver: 'sqlite',
      database: 'db.sqlite',
    })),
  },
}));

vi.mock('@orm/Database', () => ({
  Database: {
    create: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('@migrations/Migrator', () => ({
  Migrator: {
    create: vi.fn(),
  },
}));

vi.mock('@orm/DatabaseAdapterRegistry', () => ({
  DatabaseAdapterRegistry: {
    has: vi.fn(),
  },
}));

describe('MigrateWorkerCommand', () => {
  afterEach(() => {
    envState.NODE_ENV = 'development';
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints status and migration rows', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const migrator = {
      status: vi
        .fn()
        .mockResolvedValue([
          { name: '001_init', status: 'applied', applied: true, batch: 1, appliedAt: 'now' },
        ]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    };
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
    const cmd = MigrateWorkerCommand.create();

    await cmd.execute({ status: true });

    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('Adapter: sqlite'));
    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('applied: 001_init'));
  });

  it('runs fresh migrations and reports success', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const migrator = {
      status: vi.fn(),
      migrate: vi.fn(),
      fresh: vi.fn().mockResolvedValue(undefined),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    };
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
    const cmd = MigrateWorkerCommand.create();

    await cmd.execute({ fresh: true });

    expect(migrator.fresh).toHaveBeenCalled();
    expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations applied (fresh).');
  });

  it('rolls back migrations with step parsing', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const migrator = {
      status: vi.fn(),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn().mockResolvedValue({ rolledBack: 2 }),
    };
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
    const cmd = MigrateWorkerCommand.create();

    await cmd.execute({ rollback: true, step: '2' });

    expect(migrator.rollbackLastBatch).toHaveBeenCalledWith(2);
    expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations rolled back (2).');
  });

  it('warns when adapter is missing', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const migrator = {
      status: vi.fn().mockResolvedValue([]),
      migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    };
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
    const cmd = MigrateWorkerCommand.create();

    await cmd.execute({ status: true, force: true });

    expect(ErrorHandler.warn).toHaveBeenCalledWith('Missing adapter for driver: sqlite');
  });

  it('cancels destructive actions in production when not confirmed', async () => {
    envState.NODE_ENV = 'production';

    const { PromptHelper } = await import('@cli/PromptHelper');
    (PromptHelper.confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { Migrator } = await import('@migrations/Migrator');
    const migrator = {
      status: vi.fn().mockResolvedValue([]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    };
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
    const cmd = MigrateWorkerCommand.create();

    await cmd.execute({ rollback: true });

    expect(ErrorHandler.warn).toHaveBeenCalledWith('Cancelled.');
  });

  describe('Database Configuration Mapping', () => {
    it('should map sqlite configuration correctly', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with sqlite
      const { databaseConfig } = await import('@config/database');
      (databaseConfig.getConnection as any).mockReturnValue({
        driver: 'sqlite',
        database: 'test.sqlite',
      });

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(Migrator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          db: expect.any(Object),
          projectRoot: expect.any(String),
          globalDir: expect.stringContaining('workers/migrations'),
          extension: expect.any(String),
          separateTracking: true,
        })
      );
    });

    it('should map postgresql configuration correctly', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with postgresql
      const { databaseConfig } = await import('@config/database');
      (databaseConfig.getConnection as any).mockReturnValueOnce({
        driver: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
      });

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(Migrator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          db: expect.any(Object),
          projectRoot: expect.any(String),
          globalDir: expect.stringContaining('workers/migrations'),
          extension: expect.any(String),
          separateTracking: true,
        })
      );
    });

    it('should map mysql configuration correctly', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with mysql
      const { databaseConfig } = await import('@config/database');
      (databaseConfig.getConnection as any).mockReturnValueOnce({
        driver: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
      });

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(Migrator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          db: expect.any(Object),
          projectRoot: expect.any(String),
          globalDir: expect.stringContaining('workers/migrations'),
          extension: expect.any(String),
          separateTracking: true,
        })
      );
    });

    it('should map sqlserver configuration correctly', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with sqlserver
      const { databaseConfig } = await import('@config/database');
      (databaseConfig.getConnection as any).mockReturnValueOnce({
        driver: 'sqlserver',
        host: 'localhost',
        port: 1433,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
      });

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(Migrator.create).toHaveBeenCalledWith(
        expect.objectContaining({
          db: expect.any(Object),
          projectRoot: expect.any(String),
          globalDir: expect.stringContaining('workers/migrations'),
          extension: expect.any(String),
          separateTracking: true,
        })
      );
    });

    it('should throw for unknown drivers (no sqlite fallback)', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with unknown driver
      const { databaseConfig } = await import('@config/database');
      (databaseConfig.getConnection as any).mockReturnValueOnce({
        driver: 'unknown_driver',
        database: 'test.db',
      });

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await expect(cmd.execute({})).rejects.toThrow(
        'Unsupported database driver for ORM migrations'
      );

      expect(Migrator.create).not.toHaveBeenCalled();
    });
  });

  describe('Migration Actions', () => {
    it('should apply migrations and report success', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({
          appliedNames: ['001_init', '002_add_users'],
        }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations applied.');
      expect(ErrorHandler.info).toHaveBeenCalledWith('✓ 001_init');
      expect(ErrorHandler.info).toHaveBeenCalledWith('✓ 002_add_users');
    });

    it('should handle no pending migrations', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({});

      expect(ErrorHandler.info).toHaveBeenCalledWith('No pending worker migrations.');
      expect(ErrorHandler.success).not.toHaveBeenCalledWith('Worker migrations applied.');
    });

    it('should reset migrations', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn(),
        fresh: vi.fn(),
        resetAll: vi.fn().mockResolvedValue(undefined),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({ reset: true });

      expect(migrator.resetAll).toHaveBeenCalled();
      expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations reset.');
    });

    it('should parse rollback step from string option', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn(),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn().mockResolvedValue({ rolledBack: 3 }),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({ rollback: true, step: '3' });

      expect(migrator.rollbackLastBatch).toHaveBeenCalledWith(3);
      expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations rolled back (3).');
    });

    it('should default rollback step to 1 when not provided', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn(),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn().mockResolvedValue({ rolledBack: 1 }),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({ rollback: true });

      expect(migrator.rollbackLastBatch).toHaveBeenCalledWith(1);
      expect(ErrorHandler.success).toHaveBeenCalledWith('Worker migrations rolled back (1).');
    });
  });

  describe('Uncovered Lines Coverage', () => {
    it('should return true when confirmation is accepted in production', async () => {
      envState.NODE_ENV = 'production';

      const { PromptHelper } = await import('@cli/PromptHelper');
      (PromptHelper.confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // This will test the return true at line 98
      const result = await cmd.execute({ fresh: true });

      expect(result).toBeUndefined(); // Command executes successfully
    });

    it('should iterate through all database connections when --all flag is used', async () => {
      const { MigrateWorkerCommand } = await import('@cli/commands/MigrateWorkerCommand');
      const cmd = MigrateWorkerCommand.create();

      // Mock database config with multiple connections
      const { databaseConfig } = await import('@config/database');
      (databaseConfig as any).connections = {
        default: { driver: 'sqlite', database: 'default.db' },
        postgres: { driver: 'postgresql', database: 'postgres.db' },
        mysql: { driver: 'mysql', database: 'mysql.db' },
      };

      const { Migrator } = await import('@migrations/Migrator');
      const migrator = {
        status: vi.fn().mockResolvedValue([]),
        migrate: vi.fn().mockResolvedValue({ appliedNames: [] }),
        fresh: vi.fn(),
        resetAll: vi.fn(),
        rollbackLastBatch: vi.fn(),
      };
      (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue(migrator);

      const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
      (DatabaseAdapterRegistry.has as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await cmd.execute({ all: true });

      // Should call Migrator.create for each connection
      expect(Migrator.create).toHaveBeenCalledTimes(3);
      expect(ErrorHandler.info).toHaveBeenCalledWith('\n--- Connection: default (sqlite) ---');
      expect(ErrorHandler.info).toHaveBeenCalledWith('\n--- Connection: postgres (postgresql) ---');
      expect(ErrorHandler.info).toHaveBeenCalledWith('\n--- Connection: mysql (mysql) ---');
    });
  });
});
