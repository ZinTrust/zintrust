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
  env?: string;
  config?: string;
};

const runWrangler = async (cmd: IBaseCommand, args: string[]): Promise<string> => {
  // Back-compat entrypoint for tests; we only use this for D1 migrations apply.
  const dbName = args[3];
  const mode = args[4];
  const isLocal = mode === '--local';
  await RESOLVED_VOID;
  return WranglerD1.applyMigrations({ cmd, dbName, isLocal });
};

const getDbName = (projectRoot: string, options: CommandOptions): string => {
  const value = options['database'];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();

  const resolution = WranglerConfig.resolveD1Database(projectRoot);
  if (resolution.status === 'resolved') {
    return WranglerConfig.getDefaultD1DatabaseName(projectRoot) ?? 'zintrust_db';
  }

  if (resolution.status === 'ambiguous') {
    throw ErrorFactory.createCliError(
      'Multiple D1 targets are configured. Re-run with --database <database_name|binding> to choose the intended Wrangler D1 target.'
    );
  }

  return 'zintrust_db';
};

const buildExecutionContext = (options: CommandOptions): D1MigrateExecutionContext => {
  const isWorkerCommand = process.argv.includes('d1:migrate:worker');
  const isLocal = options['local'] === true || options['remote'] !== true;
  const projectRoot = process.cwd();
  const dbName = getDbName(projectRoot, options);
  const env = typeof options['env'] === 'string' ? options['env'].trim() : undefined;
  const config =
    (typeof options['config'] === 'string' ? options['config'].trim() : undefined) ??
    (typeof options['wranglerConfig'] === 'string'
      ? options['wranglerConfig'].trim()
      : undefined) ??
    (typeof options['wc'] === 'string' ? options['wc'].trim() : undefined);

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
    env,
    config,
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

    const output = WranglerD1.applyMigrations({
      cmd,
      dbName: ctx.dbName,
      isLocal: ctx.isLocal,
      env: ctx.env,
      config: ctx.config,
    });
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
          'Wrangler D1 identifier. Accepts database_name or binding; defaults to the configured wrangler d1_databases entry when available.'
        )
        .option('--env <name>', 'Wrangler environment to use (e.g., staging, production)')
        .option('--config <path>', 'Path to wrangler config file (e.g., wrangler.dev.jsonc)')
        .option(
          '--wrangler-config <path>',
          'Path to wrangler config file (e.g., wrangler.dev.jsonc)'
        )
        .option('--wc <path>', 'Path to wrangler config file (e.g., wrangler.dev.jsonc)');
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
