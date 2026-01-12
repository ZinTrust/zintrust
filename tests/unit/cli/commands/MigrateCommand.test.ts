import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
};

const migratorMock = {
  migrate: vi.fn(async () => ({ applied: 1 })),
  status: vi.fn(async () => [] as any[]),
  fresh: vi.fn(async () => ({ applied: 1 })),
  resetAll: vi.fn(async () => ({ rolledBack: 1 })),
  rollbackLastBatch: vi.fn(async () => ({ rolledBack: 1 })),
};

vi.mock('@/config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/config/database', () => ({
  databaseConfig: {
    getConnection: vi.fn(() => ({ driver: 'sqlite', database: ':memory:' })),
    migrations: {
      directory: 'database/migrations',
      extension: '.ts',
    },
  },
}));

vi.mock('@/config/env', () => ({
  Env: {
    NODE_ENV: 'test',
    get: vi.fn((_key: string, fallback: string) => fallback),
    getBool: vi.fn((_key: string, fallback: boolean) => fallback),
  },
}));

vi.mock('@/cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: vi.fn(async () => true),
  },
}));

vi.mock('@/orm/Database', () => ({
  Database: {
    create: vi.fn(() => dbMock),
  },
}));

vi.mock('@/migrations/Migrator', () => ({
  Migrator: {
    create: vi.fn(() => migratorMock),
  },
}));

vi.mock('@/cli/d1/D1SqlMigrations', () => ({
  D1SqlMigrations: {
    compileAndWrite: vi.fn(async () => [{ outputFileName: '0000_test.sql' }]),
  },
}));

vi.mock('@/cli/d1/WranglerD1', () => ({
  WranglerD1: {
    applyMigrations: vi.fn(async () => ''),
  },
}));

vi.mock('@/cli/d1/WranglerConfig', () => ({
  WranglerConfig: {
    getD1MigrationsDir: vi.fn(() => 'migrations'),
  },
}));

import { MigrateCommand } from '@/cli/commands/MigrateCommand';
import { D1SqlMigrations } from '@/cli/d1/D1SqlMigrations';
import { WranglerD1 } from '@/cli/d1/WranglerD1';
import { PromptHelper } from '@/cli/PromptHelper';
import { databaseConfig } from '@/config/database';
import { Env } from '@/config/env';
import { Migrator } from '@/migrations/Migrator';
import { Database } from '@/orm/Database';

describe('MigrateCommand', () => {
  let command: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks setup
    Env.NODE_ENV = 'test';
    //... (reset other mocks if needed)

    command = MigrateCommand.create();
    command.debug = vi.fn();
    command.info = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();

    dbMock.connect.mockResolvedValue(undefined);
    dbMock.disconnect.mockResolvedValue(undefined);
    migratorMock.migrate.mockResolvedValue({ applied: 1 });
    migratorMock.status.mockResolvedValue([]);
    migratorMock.fresh.mockResolvedValue({ applied: 1 });
    migratorMock.resetAll.mockResolvedValue({ rolledBack: 1 });
    migratorMock.rollbackLastBatch.mockResolvedValue({ rolledBack: 1 });
  });

  it('creates command and exposes commander metadata', () => {
    expect(command).toBeDefined();
    const cmd = command.getCommand();
    expect(cmd.name()).toBe('migrate');
    expect(cmd.description().length).toBeGreaterThan(0);
  });

  it('registers expected options', () => {
    const helpText = command.getCommand().helpInformation();
    expect(helpText).toContain('--fresh');
    expect(helpText).toContain('--rollback');
    expect(helpText).toContain('--reset');
    expect(helpText).toContain('--status');
    expect(helpText).toContain('--service');
    expect(helpText).toContain('--only-service');
    expect(helpText).toContain('--step');
    expect(helpText).toContain('--local');
    expect(helpText).toContain('--remote');
    expect(helpText).toContain('--database');
    expect(helpText).toContain('--no-interactive');
    expect(helpText).toContain('--verbose');
  });

  it('runs pending migrations by default', async () => {
    await command.execute({});

    expect(Database.create).toHaveBeenCalled();
    expect(dbMock.connect).toHaveBeenCalled();
    expect(Migrator.create).toHaveBeenCalled();
    expect(migratorMock.migrate).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('applied=1'));
    expect(dbMock.disconnect).toHaveBeenCalled();
  });

  it('runs status when --status is provided', async () => {
    migratorMock.status.mockResolvedValueOnce([
      {
        name: '20260101000000_create_users',
        applied: true,
        batch: 1,
        appliedAt: '2026-01-01T00:00:00.000Z',
      },
      { name: '20260102000000_add_email', applied: false, batch: null, appliedAt: null },
    ]);

    await command.execute({ status: true });

    expect(migratorMock.status).toHaveBeenCalled();
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('applied: 20260101000000_create_users')
    );
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('pending: 20260102000000_add_email')
    );
  });

  it('runs fresh when --fresh is provided', async () => {
    await command.execute({ fresh: true, interactive: false });

    expect(migratorMock.fresh).toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('drop all tables'));
    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('Fresh migration completed')
    );
  });

  it('runs reset when --reset is provided', async () => {
    await command.execute({ reset: true, interactive: false });

    expect(migratorMock.resetAll).toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('rollback ALL'));
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('rolledBack='));
  });

  it('runs rollback with parsed --step value', async () => {
    await command.execute({ rollback: true, step: '2' });

    expect(migratorMock.rollbackLastBatch).toHaveBeenCalledWith(2);
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('rolledBack='));
  });

  it('runs D1 migrations via compile + wrangler apply', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({ driver: 'd1' } as any);

    await command.execute({});

    expect(D1SqlMigrations.compileAndWrite).toHaveBeenCalled();
    expect(WranglerD1.applyMigrations).toHaveBeenCalledWith(
      expect.objectContaining({ dbName: 'zintrust_db', isLocal: true })
    );
    expect(command.success).toHaveBeenCalledWith(
      expect.stringContaining('D1 migrations completed successfully')
    );
    expect(Database.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported D1 actions like --status', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({ driver: 'd1' } as any);

    await expect(command.execute({ status: true })).rejects.toBeDefined();
    expect(Database.create).not.toHaveBeenCalled();
  });

  it('logs applied migration names if returned', async () => {
    migratorMock.migrate.mockResolvedValueOnce({
      applied: 2,
      appliedNames: ['batch1', 'batch2'],
    });

    await command.execute({});

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Applied migrations:'));
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('✓ batch1'));
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('✓ batch2'));
  });

  it('warns if separate tracking is enabled for D1', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({ driver: 'd1' } as any);
    vi.mocked(Env.getBool).mockReturnValueOnce(true); // MIGRATIONS_SEPARATE_TRACKING

    await command.execute({});

    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('MIGRATIONS_SEPARATE_TRACKING is ignored for D1')
    );
  });

  it('cancels fresh action if interactive confirmation denied', async () => {
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(false);
    await command.execute({ fresh: true, interactive: true });

    expect(migratorMock.fresh).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith('Cancelled.');
  });

  it('cancels reset action if interactive confirmation denied', async () => {
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(false);
    await command.execute({ reset: true, interactive: true });

    expect(migratorMock.resetAll).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith('Cancelled.');
  });

  it('prompts and cancels in production if not forced', async () => {
    // @ts-ignore
    Env.NODE_ENV = 'production';
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(false);

    await command.execute({});

    expect(PromptHelper.confirm).toHaveBeenCalledWith(
      expect.stringContaining('NODE_ENV=production'),
      false,
      true // interactive default
    );
    expect(migratorMock.migrate).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith('Cancelled.');
  });

  it('proceeds in production if forced', async () => {
    // @ts-ignore
    Env.NODE_ENV = 'production';
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(false); // Should not be called

    await command.execute({ force: true });

    expect(migratorMock.migrate).toHaveBeenCalled();
  });

  it('configures postgres adapter correctly', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({
      driver: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'user',
      password: 'pass',
    } as any);

    await command.execute({});

    expect(Database.create).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'postgresql',
        host: 'localhost',
        database: 'mydb',
      })
    );
  });

  it('configures mysql adapter correctly', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({
      driver: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'mydb',
      username: 'user',
      password: 'pass',
    } as any);

    await command.execute({});

    expect(Database.create).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'mysql',
        host: 'localhost',
        database: 'mydb',
      })
    );
  });
});
