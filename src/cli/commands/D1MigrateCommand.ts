/**
 * D1 Migrate Command
 * Run Cloudflare D1 migrations using Wrangler
 */
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Command } from 'commander';

const RESOLVED_VOID: Promise<void> = Promise.resolve();

type ID1MigrateCommand = IBaseCommand & {
  resolveNpmPath: () => string;
  getSafeEnv: () => NodeJS.ProcessEnv;
  runWrangler: (args: string[]) => Promise<string>;
};

const runWrangler = async (cmd: IBaseCommand, args: string[]): Promise<string> => {
  // Back-compat entrypoint for tests; we only use this for D1 migrations apply.
  const dbName = args[3];
  const mode = args[4];
  const isLocal = mode === '--local';
  await RESOLVED_VOID;
  return WranglerD1.applyMigrations({ cmd, dbName, isLocal });
};

const executeD1Migrate = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const isLocal = options['local'] === true || options['remote'] !== true;
  const dbName = typeof options['database'] === 'string' ? options['database'] : 'zintrust_db';

  cmd.info(`Running D1 migrations for ${dbName} (${isLocal ? 'local' : 'remote'})...`);

  await RESOLVED_VOID;

  try {
    const output = WranglerD1.applyMigrations({ cmd, dbName, isLocal });
    if (output !== '') cmd.info(output);
    cmd.info('✓ D1 migrations completed successfully');
  } catch (error: unknown) {
    Logger.error('D1 Migration failed', error);
    ErrorFactory.createCliError('D1 Migration failed', error);

    const err = error as { stdout?: Buffer; stderr?: Buffer };
    if (err.stdout !== undefined && err.stdout.length > 0) cmd.info(err.stdout.toString());
    if (err.stderr !== undefined && err.stderr.length > 0)
      Logger.error('Wrangler stderr', err.stderr.toString());

    if (err.stderr !== undefined && err.stderr.length > 0)
      ErrorFactory.createCliError('Wrangler stderr', err.stderr.toString());

    throw error;
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
        .option('--local', 'Run migrations against local D1 database')
        .option('--remote', 'Run migrations against remote D1 database')
        .option('--database <name>', 'D1 database name', 'zintrust_db');
    };

    const cmd = BaseCommand.create<ID1MigrateCommand>({
      name: 'd1:migrate',
      description: 'Run Cloudflare D1 migrations',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeD1Migrate(cmd, options),
    });

    cmd.resolveNpmPath = (): string => resolveNpmPath();
    cmd.getSafeEnv = (): NodeJS.ProcessEnv => appConfig.getSafeEnv();
    cmd.runWrangler = async (args: string[]): Promise<string> => runWrangler(cmd, args);

    return cmd;
  },
});
