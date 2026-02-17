import { beforeEach, describe, expect, it, vi } from 'vitest';

const compileAndWriteMock = vi.fn();
const applyMigrationsMock = vi.fn();
const getD1MigrationsDirMock = vi.fn();

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/d1/D1SqlMigrations', () => ({
  D1SqlMigrations: {
    compileAndWrite: (...args: unknown[]) => compileAndWriteMock(...args),
  },
}));

vi.mock('@cli/d1/WranglerD1', () => ({
  WranglerD1: {
    applyMigrations: (...args: unknown[]) => applyMigrationsMock(...args),
  },
}));

vi.mock('@cli/d1/WranglerConfig', () => ({
  WranglerConfig: {
    getD1MigrationsDir: (...args: unknown[]) => getD1MigrationsDirMock(...args),
  },
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    migrations: { extension: 'ts', directory: 'database/migrations' },
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/app', () => ({
  appConfig: { getSafeEnv: () => ({}), detectRuntime: () => 'nodejs' },
}));

vi.mock('@common/index', () => ({
  resolveNpmPath: () => 'npm',
}));

import { D1MigrateCommand } from '@cli/commands/D1MigrateCommand';

describe('D1MigrateCommand (coverage extras)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compileAndWriteMock.mockResolvedValue([]);
    applyMigrationsMock.mockReturnValue('');
    getD1MigrationsDirMock.mockReturnValue('should-not-be-used');
  });

  it('worker mode uses fixed migrations directories', async () => {
    const originalArgv = [...process.argv];
    process.argv = [...process.argv, 'd1:migrate:worker'];

    const cmd = D1MigrateCommand.create();
    await cmd.execute({ args: [], local: true });

    expect(compileAndWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        globalDir: expect.stringContaining('packages'),
        outputDir: expect.stringContaining('database'),
      })
    );

    process.argv = originalArgv;
  });
});
