import { describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    handle: vi.fn(),
  },
}));

vi.mock('@cli/scaffolding/MigrationGenerator', () => ({
  MigrationGenerator: { generateMigration: vi.fn() },
}));

vi.mock('@cli/scaffolding/SeederGenerator', () => ({
  SeederGenerator: { generateSeeder: vi.fn(), generateDatabaseSeeder: vi.fn() },
}));

vi.mock('@cli/scaffolding/GovernanceScaffolder', () => ({
  GovernanceScaffolder: { scaffold: vi.fn() },
}));

vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: { listFiles: vi.fn() },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

import { AddCommand } from '@cli/commands/AddCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { GovernanceScaffolder } from '@cli/scaffolding/GovernanceScaffolder';
import { MigrationGenerator } from '@cli/scaffolding/MigrationGenerator';
import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import { fs } from '@node-singletons';

describe('AddCommand (coverage)', () => {
  it('creates shorthand migration when create migration exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(FileGenerator.listFiles).mockReturnValue([
      '/project/database/migrations/20240101000000_create_users_table.ts',
    ] as any);

    vi.mocked(MigrationGenerator.generateMigration).mockResolvedValue({
      success: true,
      message: 'ok',
      filePath: '/project/database/migrations/20250101000000_add_email_users_table.ts',
      migrationName: 'add_email_users_table',
    } as any);

    const cmd = AddCommand.create();
    await cmd.execute({ args: ['migration', 'email', 'User'], noInteractive: true } as any);

    expect(MigrationGenerator.generateMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'add_email_users_table',
        table: 'users',
        column: 'email',
      })
    );
  });

  it('fails shorthand migration when create migration is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(FileGenerator.listFiles).mockReturnValue([] as any);

    const cmd = AddCommand.create();
    await expect(
      cmd.execute({ args: ['migration', 'email', 'User'], noInteractive: true } as any)
    ).rejects.toThrow(/Missing required create migration/i);
  });

  it('reports seeder guidance when states and relationships are enabled', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(SeederGenerator.generateSeeder).mockResolvedValue({
      success: true,
      message: 'ok',
      filePath: '/project/database/seeders/UserSeeder.ts',
    } as any);

    const cmd = AddCommand.create();
    await cmd.execute({
      args: ['seeder', 'UserSeeder'],
      model: 'User',
      count: 5,
      states: true,
      relationships: 'posts',
      truncate: true,
      noInteractive: true,
    } as any);

    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('seedWithStates'));
    expect(ErrorHandler.info).toHaveBeenCalledWith(
      expect.stringContaining('seedWithRelationships')
    );
  });

  it('logs files created when governance scaffolding reports outputs', async () => {
    vi.mocked(GovernanceScaffolder.scaffold).mockResolvedValue({
      success: true,
      message: 'ok',
      filesCreated: ['.eslintrc.cjs'],
    } as any);

    const cmd = AddCommand.create();
    await cmd.execute({ args: ['governance'] } as any);

    expect(ErrorHandler.info).toHaveBeenCalledWith('Files created: 1');
  });
});
