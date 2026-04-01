import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { D1SqlMigrations } from '@cli/d1/D1SqlMigrations';
import { WranglerConfig } from '@cli/d1/WranglerConfig';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import {
  confirmProductionRun,
  mapConnectionToOrmConfig,
  parseRollbackSteps,
} from '@cli/utils/DatabaseCliUtils';
import { readEnvString } from '@common/ExternalServiceUtils';
import { databaseConfig } from '@config/database';
import type { DatabaseConnectionConfig } from '@config/type';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { Migrator } from '@migrations/Migrator';
import { Database } from '@orm/Database';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import type { Command } from 'commander';

type DebuggerStorageApi = {
  prune(olderThanMs: number, keepExceptions?: boolean): Promise<number>;
  clear(): Promise<void>;
  stats(): Promise<Record<string, number>>;
};

type DebuggerConfigApi = {
  merge(override?: unknown): { pruneAfterHours: number; connection?: string };
};

type DebuggerStorageModule = {
  DebuggerStorage: {
    resolveStorage(db: unknown): DebuggerStorageApi;
  };
  DebuggerConfig: DebuggerConfigApi;
};

const loadDebuggerModule = async (): Promise<DebuggerStorageModule> => {
  try {
    return (await import('@zintrust/system-debugger')) as unknown as DebuggerStorageModule;
  } catch (error) {
    Logger.error('Failed to load optional package "@zintrust/system-debugger"', error);
    throw ErrorFactory.createCliError(
      'Package "@zintrust/system-debugger" is not installed. Add it to your project first.'
    );
  }
};

const addPruneOptions = (command: Command): void => {
  command
    .option('--hours <number>', 'Remove entries older than N hours (default: from config)', '')
    .option('--local', 'D1 only: run against local D1 database')
    .option('--remote', 'D1 only: run against remote D1 database')
    .option('--database <name>', 'D1 only: Wrangler D1 database binding name')
    .option('--keep-exceptions', 'Keep exception entries regardless of age', false);
};

const addMigrateOptions = (command: Command): void => {
  command
    .option('--status', 'Display migration status (applied, pending, failed)')
    .option('--fresh', 'Reset database: drop all tables and re-run all migrations')
    .option('--reset', 'Rollback all migrations to initial state')
    .option('--rollback', 'Rollback last migration batch')
    .option('--step <number>', 'Number of batches to rollback (use with --rollback)', '1')
    .option('--force', 'Skip production confirmation (allow unsafe operations in production)')
    .option('--all', 'Run migrations for all configured database connections')
    .option('--connection <name>', 'Use a specific database connection for debugger migrations')
    .option('--local', 'D1 only: run against local D1 database')
    .option('--remote', 'D1 only: run against remote D1 database')
    .option('--database <name>', 'D1 only: Wrangler D1 database binding name')
    .option('--no-interactive', 'Disable interactive prompts (useful for CI/CD)');
};

const resolveDashboardBasePath = (): string => {
  const raw = readEnvString('DEBUGGER_BASE_PATH').trim();
  if (raw === '') return '/debugger';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const resolveDashboardUrl = (): string => {
  const host = readEnvString('HOST').trim() || '127.0.0.1';
  const port = readEnvString('PORT').trim() || readEnvString('APP_PORT').trim() || '7777';
  return `http://${host}:${port}${resolveDashboardBasePath()}`;
};

const resolveDebuggerMigrationDir = (): string => {
  const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));

  try {
    const resolved = requireFromProject.resolve('@zintrust/system-debugger/migrations');
    return path.dirname(resolved);
  } catch {
    return path.join(process.cwd(), 'packages', 'system-debugger', 'migrations');
  }
};

const getD1DatabaseName = (options: CommandOptions): string => {
  const optionValue = options['database'];
  if (typeof optionValue === 'string' && optionValue.trim() !== '') {
    return optionValue.trim();
  }

  const projectRoot = process.cwd();
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

const getInteractive = (options: CommandOptions): boolean => options['interactive'] !== false;

const resolveDebuggerConnectionName = (options: CommandOptions): string => {
  if (isNonEmptyString(options['connection'])) {
    return String(options['connection']).trim();
  }

  return readEnvString('DEBUGGER_DB_CONNECTION').trim() || 'default';
};

const resolveDebuggerConnectionConfig = (
  options: CommandOptions
): ReturnType<typeof databaseConfig.getConnection> => {
  const selected = resolveDebuggerConnectionName(options);
  const connections = databaseConfig.connections as unknown as Record<
    string,
    DatabaseConnectionConfig
  >;
  return connections[selected] ?? databaseConfig.getConnection();
};

const isD1ConnectionDriver = (driver: string): boolean => driver === 'd1' || driver === 'd1-remote';

const resolveD1ExecutionMode = (options: CommandOptions): boolean => {
  return options['local'] === true || options['remote'] !== true;
};

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

const stripAnsi = (value: string): string => {
  return value.replaceAll(ANSI_ESCAPE_PATTERN, '');
};

const extractWranglerJson = (output: string): unknown[] | null => {
  const normalized = stripAnsi(output);
  const jsonStart = normalized.indexOf('[\n  {');
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(normalized.slice(jsonStart)) as unknown[];
  } catch {
    return null;
  }
};

const parseWranglerTable = (output: string): Array<Record<string, string>> => {
  const lines = output.split('\n').map((line) => stripAnsi(line).trim());
  const dataLines = lines.filter((line) => line.startsWith('│') && line.endsWith('│'));
  if (dataLines.length < 2) return [];

  const toCells = (line: string): string[] => {
    return line
      .split('│')
      .slice(1, -1)
      .map((cell) => cell.trim());
  };

  const headers = toCells(dataLines[0] ?? '');
  const rows = dataLines.slice(1);

  return rows.map((line) => {
    const cells = toCells(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
};

const withSqlDebuggerStorage = async <T>(
  options: CommandOptions,
  callback: (storage: DebuggerStorageApi) => Promise<T>
): Promise<T> => {
  const { DebuggerStorage } = await loadDebuggerModule();
  const conn = resolveDebuggerConnectionConfig(options);
  const db = Database.create(mapConnectionToOrmConfig(conn));
  await db.connect();

  try {
    const storage = DebuggerStorage.resolveStorage(db);
    return await callback(storage);
  } finally {
    await db.disconnect();
  }
};

const executeD1Stats = (options: CommandOptions): Record<string, number> => {
  const output = WranglerD1.executeSql({
    dbName: getD1DatabaseName(options),
    isLocal: resolveD1ExecutionMode(options),
    sql: 'SELECT type, COUNT(*) as cnt FROM zin_debugger_entries GROUP BY type ORDER BY type',
  });
  const payload = extractWranglerJson(output) as Array<{
    results?: Array<{ type?: string; cnt?: number }>;
  }> | null;
  if (payload !== null) {
    const stats: Record<string, number> = {};
    for (const row of payload[0]?.results ?? []) {
      if (typeof row.type === 'string') {
        stats[row.type] = typeof row.cnt === 'number' ? row.cnt : 0;
      }
    }
    return stats;
  }

  const rows = parseWranglerTable(output);
  const stats: Record<string, number> = {};
  for (const row of rows) {
    const key = row['type'] ?? '';
    const count = Number.parseInt(row['cnt'] ?? '0', 10);
    if (key !== '') {
      stats[key] = Number.isNaN(count) ? 0 : count;
    }
  }
  return stats;
};

const executeD1Delete = (options: CommandOptions, sql: string): number => {
  const output = WranglerD1.executeSql({
    dbName: getD1DatabaseName(options),
    isLocal: resolveD1ExecutionMode(options),
    sql: `${sql}; SELECT changes() as cnt`,
  });
  const payload = extractWranglerJson(output) as Array<{
    results?: Array<{ cnt?: number }>;
  }> | null;
  if (payload !== null) {
    const count = payload.at(-1)?.results?.[0]?.cnt;
    return typeof count === 'number' ? count : 0;
  }

  const rows = parseWranglerTable(output);
  const count = Number.parseInt(rows.at(-1)?.['cnt'] ?? '0', 10);
  return Number.isNaN(count) ? 0 : count;
};

const isBuiltInDriver = (driver: string): boolean =>
  driver === 'sqlite' ||
  driver === 'mysql' ||
  driver === 'postgresql' ||
  driver === 'sqlserver' ||
  driver === 'd1' ||
  driver === 'd1-remote';

const isDestructiveAction = (options: CommandOptions): boolean =>
  options['fresh'] === true || options['reset'] === true || options['rollback'] === true;

const executePrune = async (options: CommandOptions): Promise<void> => {
  const { DebuggerConfig } = await loadDebuggerModule();

  const config = DebuggerConfig.merge();
  const hours =
    typeof options['hours'] === 'string' && options['hours'] !== ''
      ? Number.parseInt(options['hours'], 10)
      : config.pruneAfterHours;

  const olderThanMs = hours * 60 * 60 * 1000;
  const keepExceptions = options['keepExceptions'] === true;
  const conn = resolveDebuggerConnectionConfig({
    ...options,
    connection: config.connection ?? 'default',
  });
  const threshold = Date.now() - olderThanMs;
  const pruneSql = keepExceptions
    ? `DELETE FROM zin_debugger_entries WHERE created_at < ${String(threshold)} AND type != 'exception'`
    : `DELETE FROM zin_debugger_entries WHERE created_at < ${String(threshold)}`;

  Logger.info(`Pruning debugger entries older than ${hours}h...`);
  const deleted = isD1ConnectionDriver(conn.driver)
    ? await executeD1Delete(options, pruneSql)
    : await withSqlDebuggerStorage(
        { ...options, connection: config.connection ?? 'default' },
        async (storage) => storage.prune(olderThanMs, keepExceptions)
      );
  Logger.info(`Done - removed ${deleted} entries.`);
};

const executeClear = async (options: CommandOptions): Promise<void> => {
  const { DebuggerConfig } = await loadDebuggerModule();

  const config = DebuggerConfig.merge();
  const conn = resolveDebuggerConnectionConfig({
    ...options,
    connection: config.connection ?? 'default',
  });

  Logger.info('Clearing all debugger entries...');
  if (isD1ConnectionDriver(conn.driver)) {
    await executeD1Delete(options, 'DELETE FROM zin_debugger_entries');
  } else {
    await withSqlDebuggerStorage(
      { ...options, connection: config.connection ?? 'default' },
      async (storage) => storage.clear()
    );
  }
  Logger.info('Done - all entries cleared.');
};

const executeStatus = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
  const { DebuggerConfig } = await loadDebuggerModule();

  const config = DebuggerConfig.merge();
  const connection = config.connection ?? 'default';
  const conn = resolveDebuggerConnectionConfig({ ...options, connection });
  const stats = isD1ConnectionDriver(conn.driver)
    ? await executeD1Stats(options)
    : await withSqlDebuggerStorage({ ...options, connection }, async (storage) => storage.stats());

  cmd.info(`Debugger enabled via env: ${readEnvString('DEBUGGER_ENABLED').trim() || 'false'}`);
  cmd.info(`Connection: ${connection}`);
  cmd.info(`Prune after hours: ${String(config.pruneAfterHours)}`);
  cmd.info(`Dashboard: ${resolveDashboardUrl()}`);

  const keys = Object.keys(stats).sort((left, right) => left.localeCompare(right));
  if (keys.length === 0) {
    cmd.info('Stored entries: 0');
    return;
  }

  for (const key of keys) {
    cmd.info(`${key}: ${String(stats[key] ?? 0)}`);
  }
};

const printMigrationStatus = async (
  migrator: ReturnType<typeof Migrator.create>,
  cmd: IBaseCommand
): Promise<void> => {
  const rows = await migrator.status();
  if (rows.length === 0) {
    cmd.info('No debugger migrations found.');
    return;
  }

  for (const row of rows) {
    const tag = row.status ?? (row.applied ? 'applied' : 'pending');
    const extra = row.applied ? ` (batch=${row.batch ?? '?'}, at=${row.appliedAt ?? '?'})` : '';
    cmd.info(`${tag}: ${row.name}${extra}`);
  }
};

const applyDebuggerMigrations = async (
  migrator: ReturnType<typeof Migrator.create>,
  cmd: IBaseCommand
): Promise<void> => {
  const result = await migrator.migrate();
  if (result.appliedNames.length === 0) {
    cmd.info('No pending debugger migrations.');
    return;
  }

  cmd.success('Debugger migrations applied.');
  for (const name of result.appliedNames) {
    cmd.info(`\u2713 ${name}`);
  }
};

const runMigrationActions = async (
  migrator: ReturnType<typeof Migrator.create>,
  options: CommandOptions,
  cmd: IBaseCommand,
  driver: string
): Promise<void> => {
  if (options['status'] === true) {
    cmd.info(`Adapter: ${driver}`);
    await printMigrationStatus(migrator, cmd);
    return;
  }

  if (options['fresh'] === true) {
    await migrator.fresh();
    cmd.success('Debugger migrations applied (fresh).');
    return;
  }

  if (options['reset'] === true) {
    await migrator.resetAll();
    cmd.success('Debugger migrations reset.');
    return;
  }

  if (options['rollback'] === true) {
    const steps = parseRollbackSteps(options);
    const result = await migrator.rollbackLastBatch(steps);
    cmd.success(`Debugger migrations rolled back (${result.rolledBack}).`);
    return;
  }

  await applyDebuggerMigrations(migrator, cmd);
};

const runMigrationsForConnection = async (
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
    message: 'NODE_ENV=production. Continue running debugger migrations?',
  });
  if (!proceed) return;

  if (!isBuiltInDriver(conn.driver) && !DatabaseAdapterRegistry.has(conn.driver)) {
    cmd.warn(`Missing adapter for driver: ${conn.driver}`);
    cmd.warn(
      `Install via 'zin plugin install adapter:${conn.driver}' (or 'zin add db:${conn.driver}').`
    );
  }

  const previousD1RemoteMode =
    typeof process === 'undefined' ? undefined : process.env['D1_REMOTE_MODE'];
  if (conn.driver === 'd1' || conn.driver === 'd1-remote') {
    if (
      options['status'] === true ||
      options['fresh'] === true ||
      options['reset'] === true ||
      options['rollback'] === true
    ) {
      throw ErrorFactory.createCliError(
        'D1-backed debugger migrations currently support apply only. Run `zin migrate:debugger --local|--remote` without status or rollback flags.'
      );
    }

    const projectRoot = process.cwd();
    const dbName = getD1DatabaseName(options);
    const isLocal = options['local'] === true || options['remote'] !== true;
    const outputDir = path.join(
      projectRoot,
      WranglerConfig.getD1MigrationsDir(projectRoot, dbName)
    );

    await D1SqlMigrations.compileAndWrite({
      projectRoot,
      globalDir: resolveDebuggerMigrationDir(),
      extension: databaseConfig.migrations.extension,
      includeGlobal: true,
      outputDir,
    });

    const output = WranglerD1.applyMigrations({ cmd, dbName, isLocal });
    if (output !== '') {
      cmd.info(output);
    }
    cmd.success('Debugger D1 migrations applied.');
    return;
  }

  const ormConfig = mapConnectionToOrmConfig(conn);
  const db = Database.create(ormConfig);
  await db.connect();

  try {
    const migrator = Migrator.create({
      db,
      projectRoot: process.cwd(),
      globalDir: resolveDebuggerMigrationDir(),
      extension: databaseConfig.migrations.extension,
      separateTracking: true,
    });

    await runMigrationActions(migrator, options, cmd, conn.driver);
  } finally {
    if (typeof process !== 'undefined') {
      if (previousD1RemoteMode === undefined) {
        delete process.env['D1_REMOTE_MODE'];
      } else {
        process.env['D1_REMOTE_MODE'] = previousD1RemoteMode;
      }
    }

    await db.disconnect();
  }
};

const executeMigrateDebugger = async (
  options: CommandOptions,
  cmd: IBaseCommand
): Promise<void> => {
  const interactive = getInteractive(options);
  const targets: Array<{ name: string; config: ReturnType<typeof databaseConfig.getConnection> }> =
    [];

  if (options['all'] === true) {
    for (const [name, config] of Object.entries(databaseConfig.connections)) {
      targets.push({ name, config });
    }
  } else if (isNonEmptyString(options['connection'])) {
    const selected = String(options['connection']).trim();
    const connections = databaseConfig.connections as unknown as Record<
      string,
      DatabaseConnectionConfig
    >;
    targets.push({
      name: selected,
      config: connections[selected] ?? databaseConfig.getConnection(),
    });
  } else {
    const selected = readEnvString('DEBUGGER_DB_CONNECTION').trim() || 'default';
    const connections = databaseConfig.connections as unknown as Record<
      string,
      DatabaseConnectionConfig
    >;
    targets.push({
      name: selected,
      config: connections[selected] ?? databaseConfig.getConnection(),
    });
  }

  let sequence: Promise<void> = Promise.resolve();
  for (const { name, config } of targets) {
    sequence = sequence.then(async () => {
      if (targets.length > 1) {
        cmd.info(`\n--- Connection: ${name} (${config.driver}) ---`);
      }

      await runMigrationsForConnection(config, options, cmd, interactive);
    });
  }

  await sequence;
};

const createProvider = (
  name: string,
  getCommand: () => IBaseCommand
): Readonly<{ name: string; getCommand: () => Command }> => {
  return Object.freeze({
    name,
    getCommand: (): Command => getCommand().getCommand(),
  });
};

export const DebuggerCommands = Object.freeze({
  createDebuggerPruneCommand: (): IBaseCommand =>
    BaseCommand.create({
      name: 'debugger:prune',
      description: 'Prune old entries from the debugger storage',
      addOptions: addPruneOptions,
      execute: executePrune,
    }),

  createDebuggerClearCommand: (): IBaseCommand =>
    BaseCommand.create({
      name: 'debugger:clear',
      description: 'Clear all entries from the debugger storage',
      addOptions: (command: Command): void => {
        command
          .option('--local', 'D1 only: run against local D1 database')
          .option('--remote', 'D1 only: run against remote D1 database')
          .option('--database <name>', 'D1 only: Wrangler D1 database binding name');
      },
      execute: async (options: CommandOptions): Promise<void> => executeClear(options),
    }),

  createDebuggerStatusCommand: (): IBaseCommand => {
    const cmd = BaseCommand.create({
      name: 'debugger:status',
      description: 'Show debugger storage stats and dashboard location',
      addOptions: (command: Command): void => {
        command
          .option('--local', 'D1 only: run against local D1 database')
          .option('--remote', 'D1 only: run against remote D1 database')
          .option('--database <name>', 'D1 only: Wrangler D1 database binding name');
      },
      execute: async (options: CommandOptions): Promise<void> => executeStatus(options, cmd),
    });

    return cmd;
  },

  createDebuggerMigrateCommand: (): IBaseCommand => {
    const cmd = BaseCommand.create({
      name: 'migrate:debugger',
      description: 'Run debugger package migrations',
      addOptions: addMigrateOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        executeMigrateDebugger(options, cmd),
    });

    return cmd;
  },

  createDebuggerPruneProvider: () =>
    createProvider('debugger:prune', DebuggerCommands.createDebuggerPruneCommand),

  createDebuggerClearProvider: () =>
    createProvider('debugger:clear', DebuggerCommands.createDebuggerClearCommand),

  createDebuggerStatusProvider: () =>
    createProvider('debugger:status', DebuggerCommands.createDebuggerStatusCommand),

  createDebuggerMigrateProvider: () =>
    createProvider('migrate:debugger', DebuggerCommands.createDebuggerMigrateCommand),
});
