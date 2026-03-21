import { beforeEach, describe, expect, it, vi } from 'vitest';

const compileAndWriteMock = vi.fn();
const applyMigrationsMock = vi.fn();
const getD1MigrationsDirMock = vi.fn();
const getDefaultD1DatabaseNameMock = vi.fn();
const resolveD1DatabaseMock = vi.fn();

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
    getDefaultD1DatabaseName: (...args: unknown[]) => getDefaultD1DatabaseNameMock(...args),
    resolveD1Database: (...args: unknown[]) => resolveD1DatabaseMock(...args),
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
    getDefaultD1DatabaseNameMock.mockReturnValue('d1-proxy-db');
    resolveD1DatabaseMock.mockReturnValue({
      status: 'resolved',
      matchedBy: 'single-configured',
      config: { database_name: 'd1-proxy-db', binding: 'ZIN_DB' },
      configured: [{ database_name: 'd1-proxy-db', binding: 'ZIN_DB' }],
      matches: [{ database_name: 'd1-proxy-db', binding: 'ZIN_DB' }],
    });
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

  it('throws when multiple D1 targets are configured and no database is provided', async () => {
    resolveD1DatabaseMock.mockReturnValueOnce({
      status: 'ambiguous',
      matchedBy: 'multiple-configured',
      configured: [
        { database_name: 'vizo-dev', binding: 'PRIMARY_DB' },
        { database_name: 'vizo-preview', binding: 'PREVIEW_DB' },
      ],
      matches: [
        { database_name: 'vizo-dev', binding: 'PRIMARY_DB' },
        { database_name: 'vizo-preview', binding: 'PREVIEW_DB' },
      ],
    });

    const cmd = D1MigrateCommand.create();
    await expect(cmd.execute({ args: [], local: true })).rejects.toThrow(
      /Multiple D1 targets are configured/
    );
  });
});
