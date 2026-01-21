/**
 * Migrate Worker Command
 * Run worker package migrations
 */

import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  confirmProductionRun,
  mapConnectionToOrmConfig,
  parseRollbackSteps,
} from '@cli/utils/DatabaseCliUtils';
import { databaseConfig } from '@config/database';
import { Migrator } from '@migrations/Migrator';
import * as path from '@node-singletons/path';
import { Database } from '@orm/Database';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import type { Command } from 'commander';

const addOptions = (command: Command): void => {
  command
    .option('--status', 'Display migration status (applied, pending, failed)')
    .option('--fresh', 'Reset database: drop all tables and re-run all migrations')
    .option('--reset', 'Rollback all migrations to initial state')
    .option('--rollback', 'Rollback last migration batch')
    .option('--step <number>', 'Number of batches to rollback (use with --rollback)', '1')
    .option('--force', 'Skip production confirmation (allow unsafe operations in production)')
    .option('--all', 'Run migrations for all configured database connections')
    .option('--no-interactive', 'Disable interactive prompts (useful for CI/CD)');
};

const getInteractive = (options: CommandOptions): boolean => options['interactive'] !== false;

const isDestructiveAction = (options: CommandOptions): boolean =>
  options['fresh'] === true || options['reset'] === true || options['rollback'] === true;

const printStatus = async (
  migrator: ReturnType<typeof Migrator.create>,
  cmd: IBaseCommand
): Promise<void> => {
  const rows = await migrator.status();
  if (rows.length === 0) {
    cmd.info('No migrations found.');
    return;
  }
  for (const row of rows) {
    const tag = row.status ?? (row.applied ? 'applied' : 'pending');
    const extra = row.applied ? ` (batch=${row.batch ?? '?'}, at=${row.appliedAt ?? '?'})` : '';
    cmd.info(`${tag}: ${row.name}${extra}`);
  }
};

const applyMigrations = async (
  migrator: ReturnType<typeof Migrator.create>,
  cmd: IBaseCommand
): Promise<void> => {
  const result = await migrator.migrate();
  if (result.appliedNames.length === 0) {
    cmd.info('No pending worker migrations.');
    return;
  }
  cmd.success('Worker migrations applied.');
  for (const name of result.appliedNames) {
    cmd.info(`✓ ${name}`);
  }
};

const runActions = async (
  migrator: ReturnType<typeof Migrator.create>,
  options: CommandOptions,
  cmd: IBaseCommand,
  driver: string
): Promise<void> => {
  if (options['status'] === true) {
    cmd.info(`Adapter: ${driver}`);
    await printStatus(migrator, cmd);
    return;
  }

  if (options['fresh'] === true) {
    await migrator.fresh();
    cmd.success('Worker migrations applied (fresh).');
    return;
  }

  if (options['reset'] === true) {
    await migrator.resetAll();
    cmd.success('Worker migrations reset.');
    return;
  }

  if (options['rollback'] === true) {
    const steps = parseRollbackSteps(options);
    const result = await migrator.rollbackLastBatch(steps);
    cmd.success(`Worker migrations rolled back (${result.rolledBack}).`);
    return;
  }

  await applyMigrations(migrator, cmd);
};

const runForConnection = async (
  conn: ReturnType<typeof databaseConfig.getConnection>,
  options: CommandOptions,
  cmd: IBaseCommand,
  interactive: boolean
): Promise<void> => {
  const destructive = isDestructiveAction(options);
  const proceed = await confirmProductionRun({
    cmd,
    interactive,
    destructive,
    force: options['force'] === true,
    message: 'NODE_ENV=production. Continue running worker migrations?',
  });
  if (!proceed) return;

  if (!DatabaseAdapterRegistry.has(conn.driver)) {
    cmd.warn(`Missing adapter for driver: ${conn.driver}`);
    cmd.warn('Install via `zin plugin install adapter:postgres` (or `zin add db:postgres`).');
  }

  const ormConfig = mapConnectionToOrmConfig(conn);
  const db = Database.create(ormConfig);
  await db.connect();

  try {
    const migrator = Migrator.create({
      db,
      projectRoot: process.cwd(),
      globalDir: path.join(process.cwd(), 'packages', 'workers', 'migrations'),
      extension: databaseConfig.migrations.extension,
      separateTracking: true,
    });

    await runActions(migrator, options, cmd, conn.driver);
  } finally {
    await db.disconnect();
  }
};

const executeMigrateWorker = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
  const interactive = getInteractive(options);

  const targets: Array<{ name: string; config: ReturnType<typeof databaseConfig.getConnection> }> =
    [];

  if (options['all'] === true) {
    for (const [name, config] of Object.entries(databaseConfig.connections)) {
      targets.push({ name, config });
    }
  } else {
    targets.push({ name: 'default', config: databaseConfig.getConnection() });
  }

  let sequence: Promise<void> = Promise.resolve();
  for (const { name, config } of targets) {
    sequence = sequence.then(async () => {
      if (targets.length > 1) {
        cmd.info(`\n--- Connection: ${name} (${config.driver}) ---`);
      }
      await runForConnection(config, options, cmd, interactive);
    });
  }

  await sequence;
};

export const MigrateWorkerCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'migrate:worker',
      description: 'Run worker package migrations',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeMigrateWorker(options, cmd),
    });

    return cmd;
  },
});
