/**
 * Create Command
 * Shortcuts for common scaffolding tasks.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { MigrationGenerator, type MigrationType } from '@cli/scaffolding/MigrationGenerator';
import { CommonUtils } from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

const pluralize = (snake: string): string => (snake.endsWith('s') ? snake : `${snake}s`);

const buildCreateTableMigrationName = (model: string): string => {
  const modelSnake = CommonUtils.toSnakeCase(model).replaceAll(/[^a-z0-9_]+/g, '_');
  const tablePlural = pluralize(modelSnake);
  return `create_${tablePlural}_table`;
};

const buildAddColumnMigrationName = (column: string, model: string): string => {
  const colSnake = CommonUtils.toSnakeCase(column).replaceAll(/[^a-z0-9_]+/g, '_');
  const modelSnake = CommonUtils.toSnakeCase(model).replaceAll(/[^a-z0-9_]+/g, '_');
  const tablePlural = pluralize(modelSnake);
  return `add_${colSnake}_${tablePlural}_table`;
};

const findMigrationBySuffix = (migrationsPath: string, suffix: string): string | undefined => {
  const files = FileGenerator.listFiles(migrationsPath, false);
  for (const file of files) {
    if (path.basename(file).endsWith(suffix)) return file;
  }
  return undefined;
};

const addOptions = (command: Command): void => {
  command
    .argument('<type>', 'What to create (currently: migration)')
    .argument('<name>', 'Name (for migration: model name like "user")');

  // Accepted for consistency with other CLI commands.
  command.option('--no-interactive', 'Skip interactive prompts');
};

const executeCreate = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const args = Array.isArray(options.args) ? options.args : [];
  const type = args[0];
  const name = args[1];

  if (type !== 'migration') {
    throw ErrorFactory.createCliError('Usage: zin create migration <model>');
  }

  if (typeof name !== 'string' || name.trim() === '') {
    throw ErrorFactory.createValidationError('Model name is required');
  }

  const projectRoot = process.cwd();
  const migrationsPath = path.join(projectRoot, 'database', 'migrations');
  const migrationName = buildCreateTableMigrationName(name);
  const tableName = pluralize(CommonUtils.toSnakeCase(name).replaceAll(/[^a-z0-9_]+/g, '_'));

  cmd.info(`Creating migration: ${migrationName}...`);
  const result = await MigrationGenerator.generateMigration({
    name: migrationName,
    migrationsPath,
    type: 'create' satisfies MigrationType,
    table: tableName,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success('Migration created successfully!');
  cmd.info(`File: ${path.basename(result.filePath)}`);
};

const executeCm = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const args = Array.isArray(options.args) ? options.args : [];
  const model = args[0];

  if (typeof model !== 'string' || model.trim() === '') {
    throw ErrorFactory.createCliError('Usage: zin cm <model>');
  }

  await executeCreate(cmd, { ...options, args: ['migration', model] });
};

const executeAm = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const args = Array.isArray(options.args) ? options.args : [];
  const column = args[0];
  const model = args[1];

  if (
    typeof column !== 'string' ||
    column.trim() === '' ||
    typeof model !== 'string' ||
    model.trim() === ''
  ) {
    throw ErrorFactory.createCliError('Usage: zin am <column> <model>');
  }

  const projectRoot = process.cwd();
  const migrationsPath = path.join(projectRoot, 'database', 'migrations');

  const tableName = pluralize(CommonUtils.toSnakeCase(model).replaceAll(/[^a-z0-9_]+/g, '_'));

  const createName = buildCreateTableMigrationName(model);
  const existingCreate = findMigrationBySuffix(migrationsPath, `_${createName}.ts`);
  if (existingCreate === undefined) {
    throw ErrorFactory.createCliError(
      `Missing required create migration for model '${model}'. Create it first: zin cm ${model}`
    );
  }

  const migrationName = buildAddColumnMigrationName(column, model);
  cmd.info(`Creating migration: ${migrationName}...`);

  const result = await MigrationGenerator.generateMigration({
    name: migrationName,
    migrationsPath,
    // Let generator infer type from name (add_* => alter)
    table: tableName,
    column: CommonUtils.toSnakeCase(column).replaceAll(/[^a-z0-9_]+/g, '_'),
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success('Migration created successfully!');
  cmd.info(`File: ${path.basename(result.filePath)}`);
};

export const CreateCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'create',
      description: 'Create resources (e.g. migrations) with opinionated naming',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeCreate(cmd, options),
    });

    return cmd;
  },
});

export const CreateMigrationCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'cm',
      description: 'Shortcut: create migration for a model (create_<models>_table)',
      addOptions: (command: Command): void => {
        command.argument('<model>', 'Model name (e.g. user)');
        command.option('--no-interactive', 'Skip interactive prompts');
      },
      execute: async (options: CommandOptions): Promise<void> => executeCm(cmd, options),
    });

    return cmd;
  },
});

export const AddMigrationCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'am',
      description: 'Shortcut: add column migration for a model (add_<col>_<models>_table)',
      addOptions: (command: Command): void => {
        command.argument('<column>', 'Column name (e.g. bio)');
        command.argument('<model>', 'Model name (e.g. user)');
        command.option('--no-interactive', 'Skip interactive prompts');
      },
      execute: async (options: CommandOptions): Promise<void> => executeAm(cmd, options),
    });

    return cmd;
  },
});
