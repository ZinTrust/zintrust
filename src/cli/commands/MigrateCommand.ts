/**
 * Migrate Command
 * Run database migrations
 */

import { Migrator } from '@/migrations/Migrator';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { D1SqlMigrations } from '@cli/d1/D1SqlMigrations';
import { WranglerConfig } from '@cli/d1/WranglerConfig';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import { PromptHelper } from '@cli/PromptHelper';
import { databaseConfig } from '@config/database';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { Database } from '@orm/Database';
import type { DatabaseConfig as OrmDatabaseConfig } from '@orm/DatabaseAdapter';
import { Command } from 'commander';

const addMigrateOptions = (command: Command): void => {
  command
    .option('--fresh', 'Drop all tables and re-run migrations')
    .option('--rollback', 'Rollback last migration batch')
    .option('--reset', 'Rollback all migrations')
    .option('--status', 'Show migration status')
    .option('--service <domain/name>', 'Run global + service-local migrations')
    .option('--only-service <domain/name>', 'Run only service-local migrations')
    .option('--step <number>', 'Number of batches to rollback (for --rollback)', '1')
    .option('--force', 'Allow running migrations in production without prompts')
    .option('--local', 'D1 only: run migrations against local D1 database')
    .option('--remote', 'D1 only: run migrations against remote D1 database')
    .option('--database <name>', 'D1 only: D1 database name', 'zintrust_db')
    .option('--no-interactive', 'Skip interactive prompts');
};

const getInteractive = (options: CommandOptions): boolean =>
  options['interactive'] !== false && process.env['CI'] !== 'true';

const getMigrationDirs = (): {
  globalDir: string;
  extension: string;
  separateTracking: boolean;
} => {
  const globalDir = Env.get('MIGRATIONS_GLOBAL_DIR', databaseConfig.migrations.directory);
  const extension = databaseConfig.migrations.extension;
  const separateTracking = Env.getBool('MIGRATIONS_SEPARATE_TRACKING', false);
  return { globalDir, extension, separateTracking };
};

const getServiceArgs = (
  options: CommandOptions
): { service: string | undefined; includeGlobal: boolean } => {
  let serviceArg: string | undefined;

  if (typeof options['onlyService'] === 'string') {
    serviceArg = String(options['onlyService']);
  } else if (typeof options['service'] === 'string') {
    serviceArg = String(options['service']);
  }

  const includeGlobal = typeof options['onlyService'] !== 'string';
  return { service: serviceArg, includeGlobal };
};

const isDestructiveAction = (options: CommandOptions): boolean =>
  options['fresh'] === true || options['reset'] === true || options['rollback'] === true;

const isD1Driver = (driver: string): boolean => driver === 'd1' || driver === 'd1-remote';

const mapConnectionToOrmConfig = (
  conn: ReturnType<typeof databaseConfig.getConnection>
): OrmDatabaseConfig => {
  switch (conn.driver) {
    case 'sqlite':
      return { driver: 'sqlite', database: conn.database };
    case 'postgresql':
      return {
        driver: 'postgresql',
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      };
    case 'mysql':
      return {
        driver: 'mysql',
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      };
    default:
      return { driver: 'sqlite', database: ':memory:' };
  }
};

const confirmProductionRun = async (
  cmd: IBaseCommand,
  interactive: boolean,
  destructive: boolean,
  force: boolean
): Promise<boolean> => {
  if (Env.NODE_ENV !== 'production') return true;
  if (force) return true;

  const confirmed = await PromptHelper.confirm(
    `NODE_ENV=production. Continue running migrations${destructive ? ' (destructive)' : ''}?`,
    false,
    interactive
  );

  if (!confirmed) {
    cmd.warn('Cancelled.');
    return false;
  }

  return true;
};

const printStatus = (
  cmd: IBaseCommand,
  rows: Array<{
    name: string;
    applied: boolean;
    batch?: number | null;
    status?: string | null;
    appliedAt?: string | null;
  }>
): void => {
  if (rows.length === 0) {
    cmd.info('No migrations found.');
    return;
  }

  for (const row of rows) {
    const normalizedStatus = typeof row.status === 'string' ? row.status : null;
    const tag = normalizedStatus ?? (row.applied ? 'applied' : 'pending');

    const hasMeta =
      normalizedStatus === 'completed' ||
      normalizedStatus === 'failed' ||
      normalizedStatus === 'running' ||
      row.applied;
    const extra = hasMeta ? ` (batch=${row.batch ?? '?'}, at=${row.appliedAt ?? '?'})` : '';

    cmd.info(`${tag}: ${row.name}${extra}`);
  }
};

const parseRollbackSteps = (options: CommandOptions): number => {
  const stepRaw = typeof options['step'] === 'string' ? options['step'] : '1';
  return Math.max(1, Number.parseInt(stepRaw, 10) || 1);
};

const runMigratorActions = async (
  migrator: ReturnType<typeof Migrator.create>,
  options: CommandOptions,
  cmd: IBaseCommand,
  interactive: boolean,
  driver: string
): Promise<void> => {
  if (options['status'] === true) {
    cmd.info(`Adapter: ${driver}`);
    const rows = await migrator.status();
    printStatus(cmd, rows);
    return;
  }

  if (options['fresh'] === true) {
    cmd.warn('This will drop all tables and re-run migrations.');
    if (interactive) {
      const confirmed = await PromptHelper.confirm('Continue?', false, interactive);
      if (!confirmed) {
        cmd.warn('Cancelled.');
        return;
      }
    }

    const result = await migrator.fresh();
    cmd.success(`Fresh migration completed (applied=${result.applied})`);
    return;
  }

  if (options['reset'] === true) {
    cmd.warn('This will rollback ALL migrations.');
    if (interactive) {
      const confirmed = await PromptHelper.confirm('Continue?', false, interactive);
      if (!confirmed) {
        cmd.warn('Cancelled.');
        return;
      }
    }

    const result = await migrator.resetAll();
    cmd.success(`All migrations reset (rolledBack=${result.rolledBack})`);
    return;
  }

  if (options['rollback'] === true) {
    const steps = parseRollbackSteps(options);
    const result = await migrator.rollbackLastBatch(steps);
    cmd.success(`Migrations rolled back (rolledBack=${result.rolledBack})`);
    return;
  }

  cmd.info('Running pending migrations...');
  const result = await migrator.migrate();
  cmd.success(`Migrations completed successfully (applied=${result.applied})`);
};

const runD1Actions = async (params: {
  options: CommandOptions;
  cmd: IBaseCommand;
  projectRoot: string;
  globalDir: string;
  extension: string;
  separateTracking: boolean;
  service: string | undefined;
  includeGlobal: boolean;
}): Promise<void> => {
  const {
    options,
    cmd,
    projectRoot,
    globalDir,
    extension,
    separateTracking,
    service,
    includeGlobal,
  } = params;

  if (
    options['status'] === true ||
    options['fresh'] === true ||
    options['reset'] === true ||
    options['rollback'] === true
  ) {
    throw ErrorFactory.createCliError(
      'This project is configured for D1. Only applying migrations is supported here. Use `zin d1:migrate --local|--remote` (and Wrangler subcommands) for status/rollback/reset.'
    );
  }

  if (separateTracking) {
    cmd.warn('Note: MIGRATIONS_SEPARATE_TRACKING is ignored for D1 (Wrangler owns tracking).');
  }

  const isLocal = options['local'] === true || options['remote'] !== true;
  const dbName = typeof options['database'] === 'string' ? options['database'] : 'zintrust_db';

  const migrationsRelDir = WranglerConfig.getD1MigrationsDir(projectRoot, dbName);
  const outputDir = path.join(projectRoot, migrationsRelDir);

  cmd.info(`Generating D1 SQL migrations into ${migrationsRelDir}...`);
  const generated = await D1SqlMigrations.compileAndWrite({
    projectRoot,
    globalDir,
    extension,
    service,
    includeGlobal,
    outputDir,
  });
  cmd.info(`Generated ${generated.length} SQL migration file(s).`);

  cmd.info(`Running D1 migrations for ${dbName} (${isLocal ? 'local' : 'remote'})...`);
  const output = WranglerD1.applyMigrations({ cmd, dbName, isLocal });
  if (output !== '') cmd.info(output);
  cmd.success('D1 migrations completed successfully');
};

const executeMigrate = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
  cmd.debug(`Migrate command executed with options: ${JSON.stringify(options)}`);

  const interactive = getInteractive(options);
  const conn = databaseConfig.getConnection();

  const { globalDir, extension, separateTracking } = getMigrationDirs();
  const { service, includeGlobal } = getServiceArgs(options);

  if (isD1Driver(conn.driver)) {
    await runD1Actions({
      options,
      cmd,
      projectRoot: process.cwd(),
      globalDir,
      extension,
      separateTracking,
      service,
      includeGlobal,
    });
    return;
  }

  const ormConfig = mapConnectionToOrmConfig(conn);
  const destructive = isDestructiveAction(options);
  const force = options['force'] === true;

  const okToProceed = await confirmProductionRun(cmd, interactive, destructive, force);
  if (!okToProceed) return;

  const db = Database.create(ormConfig);
  await db.connect();
  try {
    const migrator = Migrator.create({
      db,
      projectRoot: process.cwd(),
      globalDir,
      extension,
      separateTracking,
      service,
      includeGlobal,
    });

    await runMigratorActions(migrator, options, cmd, interactive, conn.driver);
  } finally {
    await db.disconnect();
  }
};

/**
 * Migrate Command Factory
 */
export const MigrateCommand = Object.freeze({
  /**
   * Create a new migrate command instance
   */
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'migrate',
      description: 'Run database migrations',
      addOptions: addMigrateOptions,
      execute: async (options: CommandOptions): Promise<void> => executeMigrate(options, cmd),
    });

    return cmd;
  },
});
