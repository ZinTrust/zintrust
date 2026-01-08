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

import { MigrateCommand } from '@/cli/commands/MigrateCommand';
import { databaseConfig } from '@/config/database';
import { Migrator } from '@/migrations/Migrator';
import { Database } from '@/orm/Database';

describe('MigrateCommand', () => {
  let command: any;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('throws a CLI error for D1 configs', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({ driver: 'd1' } as any);

    await expect(command.execute({})).rejects.toBeDefined();
    expect(Database.create).not.toHaveBeenCalled();
  });
});
