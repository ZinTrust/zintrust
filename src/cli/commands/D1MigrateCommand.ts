/**
 * D1 Migrate Command
 * Run Cloudflare D1 migrations using Wrangler
 */
import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { D1SqlMigrations } from '@cli/d1/D1SqlMigrations';
import { WranglerConfig } from '@cli/d1/WranglerConfig';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { databaseConfig } from '@config/database';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import type { Command } from 'commander';

const RESOLVED_VOID: Promise<void> = Promise.resolve();

type ID1MigrateCommand = IBaseCommand & {
  resolveNpmPath: () => string;
  getSafeEnv: () => NodeJS.ProcessEnv;
  runWrangler: (args: string[]) => Promise<string>;
};

type D1MigrateExecutionContext = {
  isLocal: boolean;
  dbName: string;
  projectRoot: string;
  migrationsRelDir: string;
  sourceMigrationsDir: string;
  outputDir: string;
};

const runWrangler = async (cmd: IBaseCommand, args: string[]): Promise<string> => {
  // Back-compat entrypoint for tests; we only use this for D1 migrations apply.
  const dbName = args[3];
  const mode = args[4];
  const isLocal = mode === '--local';
  await RESOLVED_VOID;
  return WranglerD1.applyMigrations({ cmd, dbName, isLocal });
};

const getDbName = (options: CommandOptions): string => {
  const value = options['database'];
  return typeof value === 'string' && value.trim() !== '' ? value : 'zintrust_db';
};

const buildExecutionContext = (options: CommandOptions): D1MigrateExecutionContext => {
  const isWorkerCommand = process.argv.includes('d1:migrate:worker');
  const isLocal = options['local'] === true || options['remote'] !== true;
  const dbName = getDbName(options);
  const projectRoot = process.cwd();

  const migrationsRelDir = isWorkerCommand
    ? path.join('database', 'migrations', 'd1')
    : WranglerConfig.getD1MigrationsDir(projectRoot, dbName);

  const sourceMigrationsDir = isWorkerCommand
    ? path.join('packages', 'workers', 'migrations')
    : databaseConfig.migrations.directory;

  return {
    isLocal,
    dbName,
    projectRoot,
    migrationsRelDir,
    sourceMigrationsDir,
    outputDir: path.join(projectRoot, migrationsRelDir),
  };
};

const handleMigrationError = (cmd: IBaseCommand, error: unknown): never => {
  Logger.error('D1 Migration failed', error);
  ErrorFactory.createCliError('D1 Migration failed', error);

  const err = error as { stdout?: Buffer; stderr?: Buffer };
  if (err.stdout !== undefined && err.stdout.length > 0) cmd.info(err.stdout.toString());

  if (err.stderr !== undefined && err.stderr.length > 0) {
    const stderr = err.stderr.toString();
    Logger.error('Wrangler stderr', stderr);
    ErrorFactory.createCliError('Wrangler stderr', stderr);
  }

  throw error;
};

const executeD1Migrate = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const ctx = buildExecutionContext(options);

  cmd.info(`Running D1 migrations for ${ctx.dbName} (${ctx.isLocal ? 'local' : 'remote'})...`);
  cmd.info(`Generating D1 SQL migrations into ${ctx.migrationsRelDir}...`);

  await RESOLVED_VOID;

  try {
    const generated = await D1SqlMigrations.compileAndWrite({
      projectRoot: ctx.projectRoot,
      globalDir: ctx.sourceMigrationsDir,
      extension: databaseConfig.migrations.extension,
      includeGlobal: true,
      outputDir: ctx.outputDir,
    });
    cmd.info(`Generated ${generated.length} SQL migration file(s).`);

    const output = WranglerD1.applyMigrations({ cmd, dbName: ctx.dbName, isLocal: ctx.isLocal });
    if (output !== '') cmd.info(output);
    cmd.info('✓ D1 migrations completed successfully');
  } catch (error: unknown) {
    handleMigrationError(cmd, error);
  }
};

/**
 * D1 Migrate Command
 * Run Cloudflare D1 migrations using Wrangler
 */

/**
 * D1 Migrate Command Factory
 */
export const D1MigrateCommand = Object.freeze({
  /**
   * Create a new D1 migrate command instance
   */
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command
        .option('--local', 'Run against local D1 database (via wrangler dev)')
        .option('--remote', 'Run against remote D1 database (production)')
        .option(
          '--database <name>',
          'Wrangler D1 database binding name (from wrangler.toml). Defaults to "zintrust_db"'
        );
    };

    const cmd = BaseCommand.create<ID1MigrateCommand>({
      name: 'd1:migrate',
      description: 'Run Cloudflare D1 migrations',
      aliases: ['d1:migrate:worker'],
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeD1Migrate(cmd, options),
    });

    cmd.resolveNpmPath = (): string => resolveNpmPath();
    cmd.getSafeEnv = (): NodeJS.ProcessEnv => appConfig.getSafeEnv();
    cmd.runWrangler = async (args: string[]): Promise<string> => runWrangler(cmd, args);

    return cmd;
  },
});
