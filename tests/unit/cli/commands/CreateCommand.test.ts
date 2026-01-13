/* eslint-disable max-nested-callbacks */
import {
  AddMigrationCommand,
  CreateCommand,
  CreateMigrationCommand,
} from '@cli/commands/CreateCommand';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { MigrationGenerator } from '@cli/scaffolding/MigrationGenerator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/scaffolding/FileGenerator');
vi.mock('@cli/scaffolding/MigrationGenerator');

// We need to intercept the execution logic.
// The commands rely on the `cmd` instance created inside `create()` method.
// We can spy on BaseCommand.create to modify the returned object or spy on the methods of the returned object.

describe('CreateCommand Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/root');
    // Mock successful migration generation by default
    vi.mocked(MigrationGenerator.generateMigration).mockResolvedValue({
      success: true,
      filePath: '/root/database/migrations/xxx.ts',
      message: 'Created',
      migrationName: '',
    });
  });

  describe('configuration', () => {
    it('CreateCommand should have correct arguments and options', () => {
      const command = CreateCommand.create();
      const cmdObj = command.getCommand();

      // @ts-ignore
      expect(cmdObj._args[0]._name).toBe('type');
      // @ts-ignore
      expect(cmdObj._args[1]._name).toBe('name');

      const option = cmdObj.options.find((o) => o.attributeName() === 'interactive');
      expect(option).toBeDefined();
      expect(option?.negate).toBe(true); // --no-interactive
    });

    it('CreateMigrationCommand should have correct arguments and options', () => {
      const command = CreateMigrationCommand.create();
      const cmdObj = command.getCommand();
      // @ts-ignore
      expect(cmdObj._args[0]._name).toBe('model');

      const option = cmdObj.options.find((o) => o.attributeName() === 'interactive');
      expect(option).toBeDefined();
    });

    it('AddMigrationCommand should have correct arguments and options', () => {
      const command = AddMigrationCommand.create();
      const cmdObj = command.getCommand();
      // @ts-ignore
      expect(cmdObj._args[0]._name).toBe('column');
      // @ts-ignore
      expect(cmdObj._args[1]._name).toBe('model');

      const option = cmdObj.options.find((o) => o.attributeName() === 'interactive');
      expect(option).toBeDefined();
    });
  });

  describe('zin create', () => {
    it('should throw if type is not migration', async () => {
      const command = CreateCommand.create();
      // args: ['something', 'name']
      await expect(command.execute({ args: ['something', 'name'] })).rejects.toThrow(
        'Usage: zin create migration <model>'
      );
    });

    it('should throw if name is missing', async () => {
      const command = CreateCommand.create();
      await expect(command.execute({ args: ['migration', ''] })).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should call MigrationGenerator and succeed', async () => {
      const command = CreateCommand.create();
      // Spy on info/success
      const infoSpy = vi.spyOn(command, 'info').mockImplementation(() => {});
      const successSpy = vi.spyOn(command, 'success').mockImplementation(() => {});

      await command.execute({ args: ['migration', 'User'] });

      expect(MigrationGenerator.generateMigration).toHaveBeenCalledWith({
        name: 'create_users_table',
        migrationsPath: '/root/database/migrations',
        type: 'create',
        table: 'users',
      });

      expect(successSpy).toHaveBeenCalledWith('Migration created successfully!');
      expect(infoSpy).toHaveBeenCalled();
    });

    it('should throw if MigrationGenerator fails', async () => {
      const command = CreateCommand.create();
      vi.mocked(MigrationGenerator.generateMigration).mockResolvedValueOnce({
        success: false,
        message: 'Failed to generate',
        migrationName: '',
        filePath: '',
      });

      await expect(command.execute({ args: ['migration', 'User'] })).rejects.toThrow(
        'Failed to generate'
      );
    });
  });

  describe('zin cm (Create Migration Shortcut)', () => {
    it('should throw if model is missing', async () => {
      const command = CreateMigrationCommand.create();
      await expect(command.execute({ args: [] })).rejects.toThrow('Usage: zin cm <model>');
    });

    it('should throw if model is empty string', async () => {
      const command = CreateMigrationCommand.create();
      await expect(command.execute({ args: ['   '] })).rejects.toThrow('Usage: zin cm <model>');
    });

    it('should call CreateCommand.execute logic internally', async () => {
      const command = CreateMigrationCommand.create();
      const successSpy = vi.spyOn(command, 'success').mockImplementation(() => {});

      await command.execute({ args: ['Product'] });

      expect(MigrationGenerator.generateMigration).toHaveBeenCalledWith({
        name: 'create_products_table',
        migrationsPath: '/root/database/migrations',
        type: 'create',
        table: 'products',
      });
      expect(successSpy).toHaveBeenCalled();
    });

    it('should handle plural model names correctly', async () => {
      const command = CreateMigrationCommand.create();
      const successSpy = vi.spyOn(command, 'success').mockImplementation(() => {});

      await command.execute({ args: ['News'] });

      expect(MigrationGenerator.generateMigration).toHaveBeenCalledWith({
        name: 'create_news_table',
        migrationsPath: '/root/database/migrations',
        type: 'create',
        table: 'news',
      });
      expect(successSpy).toHaveBeenCalled();
    });
  });

  describe('zin am (Add Migration Shortcut)', () => {
    it('should throw if arguments missing', async () => {
      const command = AddMigrationCommand.create();
      await expect(command.execute({ args: ['col'] })).rejects.toThrow(
        'Usage: zin am <column> <model>'
      );
    });

    it('should throw if parent create migration is missing', async () => {
      const command = AddMigrationCommand.create();
      // Mock listFiles to return empty
      vi.mocked(FileGenerator.listFiles).mockReturnValue([]);

      await expect(command.execute({ args: ['bio', 'User'] })).rejects.toThrow(
        "Missing required create migration for model 'User'. Create it first: zin cm User"
      );
    });

    it('should throw if parent create migration is not found among other files', async () => {
      const command = AddMigrationCommand.create();
      // Mock listFiles to return unrelated files
      vi.mocked(FileGenerator.listFiles).mockReturnValue(['2023_other_migration.ts']);

      await expect(command.execute({ args: ['bio', 'User'] })).rejects.toThrow(
        "Missing required create migration for model 'User'"
      );
    });

    it('should generate add column migration if parent exists', async () => {
      const command = AddMigrationCommand.create();
      // Mock listFiles to find create migration
      vi.mocked(FileGenerator.listFiles).mockReturnValue([
        '/root/database/migrations/2023_create_users_table.ts',
      ]);

      const successSpy = vi.spyOn(command, 'success').mockImplementation(() => {});

      await command.execute({ args: ['bio', 'User'] });

      expect(MigrationGenerator.generateMigration).toHaveBeenCalledWith({
        name: 'add_bio_users_table',
        migrationsPath: '/root/database/migrations',
        table: 'users',
        column: 'bio',
      });

      expect(successSpy).toHaveBeenCalled();
    });

    it('should throw if MigrationGenerator fails in add migration', async () => {
      const command = AddMigrationCommand.create();
      vi.mocked(FileGenerator.listFiles).mockReturnValue([
        '/root/database/migrations/2023_create_users_table.ts',
      ]);
      vi.mocked(MigrationGenerator.generateMigration).mockResolvedValueOnce({
        success: false,
        message: 'Failed to add column',
        migrationName: '',
        filePath: '',
      });

      await expect(command.execute({ args: ['bio', 'User'] })).rejects.toThrow(
        'Failed to add column'
      );
    });
  });
});
