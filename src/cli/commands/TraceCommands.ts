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
import { Logger } from '@config/logger';
import type { DatabaseConnectionConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { Migrator } from '@migrations/Migrator';
import { existsSync } from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { Database } from '@orm/Database';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import type { Command } from 'commander';

type TraceStorageApi = {
  prune(olderThanMs: number, keepExceptions?: boolean): Promise<number>;
  clear(): Promise<void>;
  stats(): Promise<Record<string, number>>;
};

type TraceConfigApi = {
  merge(override?: unknown): { pruneAfterHours: number; connection?: string };
};

type TraceStorageModule = {
  TraceStorage: {
    resolveStorage(db: unknown): TraceStorageApi;
  };
  TraceConfig: TraceConfigApi;
};

type TraceMigrationTarget = {
  dir: string;
  extension: string;
};

const loadTraceModule = async (): Promise<TraceStorageModule> => {
  try {
    return (await import('packages/trace/src')) as unknown as TraceStorageModule;
  } catch (error) {
    Logger.error('Failed to load optional package "@zintrust/trace"', error);
    throw ErrorFactory.createCliError(
      'Package "@zintrust/trace" is not installed. Add it to your project first.'
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
    .option('--connection <name>', 'Use a specific database connection for trace migrations')
    .option('--local', 'D1 only: run against local D1 database')
    .option('--remote', 'D1 only: run against remote D1 database')
    .option('--database <name>', 'D1 only: Wrangler D1 database binding name')
    .option('--no-interactive', 'Disable interactive prompts (useful for CI/CD)');
};

const resolveDashboardBasePath = (): string => {
  const raw = readEnvString('TRACE_BASE_PATH').trim();
  if (raw === '') return '/trace';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const resolveDashboardUrl = (): string => {
  const host = readEnvString('HOST').trim() || '127.0.0.1';
  const port = readEnvString('PORT').trim() || readEnvString('APP_PORT').trim() || '7777';
  return `http://${host}:${port}${resolveDashboardBasePath()}`;
};

const resolveTraceMigrationTargetFromResolvedPath = (
  resolvedPath: string
): TraceMigrationTarget => {
  const extension = path.extname(resolvedPath).toLowerCase();
  const dir = path.dirname(resolvedPath);

  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return {
      dir,
      extension: extension.slice(1),
    };
  }

  if (extension === '.ts') {
    const baseName = path.basename(resolvedPath, extension);
    for (const candidateExt of ['.js', '.mjs', '.cjs']) {
      const candidatePath = path.join(dir, `${baseName}${candidateExt}`);
      if (!existsSync(candidatePath)) continue;

      return {
        dir,
        extension: candidateExt.slice(1),
      };
    }

    throw ErrorFactory.createCliError(
      'Installed package "@zintrust/trace" exposes TypeScript-only migrations. Upgrade to a version that publishes runnable JavaScript migrations.'
    );
  }

  return {
    dir,
    extension: databaseConfig.migrations.extension,
  };
};

const resolveTraceMigrationTarget = (): TraceMigrationTarget => {
  const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));

  try {
    const resolved = requireFromProject.resolve('@zintrust/trace/migrations');
    return resolveTraceMigrationTargetFromResolvedPath(resolved);
  } catch (error) {
    if (error instanceof Error && error.message.includes('TypeScript-only migrations')) {
      throw error;
    }

    return {
      dir: path.join(process.cwd(), 'packages', 'trace', 'migrations'),
      extension: 'ts',
    };
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

const resolveRuntimeDefaultConnectionName = (): string => {
  const configuredDefault = String(databaseConfig.default ?? '').trim();
  return configuredDefault === '' ? 'default' : configuredDefault;
};

const normalizeConnectionName = (value: string): string => {
  const normalized = value.trim();
  if (normalized === '' || normalized === 'default') {
    return resolveRuntimeDefaultConnectionName();
  }

  return normalized;
};

const resolveTraceConnectionName = (options: CommandOptions): string => {
  if (isNonEmptyString(options['connection'])) {
    return normalizeConnectionName(String(options['connection']));
  }

  return normalizeConnectionName(readEnvString('TRACE_DB_CONNECTION').trim());
};

const withConfiguredTraceConnection = (
  options: CommandOptions,
  configuredConnection?: string
): CommandOptions => {
  if (isNonEmptyString(options['connection'])) {
    return {
      ...options,
      connection: resolveTraceConnectionName(options),
    };
  }

  if (isNonEmptyString(configuredConnection)) {
    return {
      ...options,
      connection: normalizeConnectionName(configuredConnection),
    };
  }

  return {
    ...options,
    connection: resolveTraceConnectionName(options),
  };
};

const resolveTraceConnectionConfig = (
  options: CommandOptions
): ReturnType<typeof databaseConfig.getConnection> => {
  const selected = resolveTraceConnectionName(options);
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

const ANSI_ESCAPE = String.fromCodePoint(27);

const stripAnsi = (value: string): string => {
  let output = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== ANSI_ESCAPE) {
      output += char;
      continue;
    }

    if (value[index + 1] !== '[') {
      continue;
    }

    index += 2;
    while (index < value.length && value[index] !== 'm') {
      index += 1;
    }
  }

  return output;
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

const buildStatsFromJsonPayload = (
  payload: Array<{
    results?: Array<{ type?: string; cnt?: number }>;
  }>
): Record<string, number> => {
  const stats: Record<string, number> = {};

  for (const row of payload[0]?.results ?? []) {
    if (typeof row.type === 'string') {
      stats[row.type] = typeof row.cnt === 'number' ? row.cnt : 0;
    }
  }

  return stats;
};

const buildStatsFromTableRows = (rows: Array<Record<string, string>>): Record<string, number> => {
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

const withSqlTraceStorage = async <T>(
  options: CommandOptions,
  callback: (storage: TraceStorageApi) => Promise<T>
): Promise<T> => {
  const { TraceStorage } = await loadTraceModule();
  const conn = resolveTraceConnectionConfig(options);
  const db = Database.create(mapConnectionToOrmConfig(conn));
  await db.connect();

  try {
    const storage = TraceStorage.resolveStorage(db);
    return await callback(storage);
  } finally {
    await db.disconnect();
  }
};

const executeD1Stats = (options: CommandOptions): Record<string, number> => {
  const output = WranglerD1.executeSql({
    dbName: getD1DatabaseName(options),
    isLocal: resolveD1ExecutionMode(options),
    sql: 'SELECT type, COUNT(*) as cnt FROM zin_trace_entries GROUP BY type ORDER BY type',
  });
  const payload = extractWranglerJson(output) as Array<{
    results?: Array<{ type?: string; cnt?: number }>;
  }> | null;
  if (payload !== null) {
    return buildStatsFromJsonPayload(payload);
  }

  return buildStatsFromTableRows(parseWranglerTable(output));
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
  const { TraceConfig } = await loadTraceModule();

  const config = TraceConfig.merge();
  const resolvedOptions = withConfiguredTraceConnection(options, config.connection);
  const hours =
    typeof options['hours'] === 'string' && options['hours'] !== ''
      ? Number.parseInt(options['hours'], 10)
      : config.pruneAfterHours;

  const olderThanMs = hours * 60 * 60 * 1000;
  const keepExceptions = options['keepExceptions'] === true;
  const conn = resolveTraceConnectionConfig(resolvedOptions);
  const threshold = Date.now() - olderThanMs;
  const pruneSql = keepExceptions
    ? `DELETE FROM zin_trace_entries WHERE created_at < ${String(threshold)} AND type != 'exception'`
    : `DELETE FROM zin_trace_entries WHERE created_at < ${String(threshold)}`;

  Logger.info(`Pruning trace entries older than ${hours}h...`);
  const deleted = isD1ConnectionDriver(conn.driver)
    ? executeD1Delete(options, pruneSql)
    : await withSqlTraceStorage(resolvedOptions, async (storage) =>
        storage.prune(olderThanMs, keepExceptions)
      );
  Logger.info(`Done - removed ${deleted} entries.`);
};

const executeClear = async (options: CommandOptions): Promise<void> => {
  const { TraceConfig } = await loadTraceModule();

  const config = TraceConfig.merge();
  const resolvedOptions = withConfiguredTraceConnection(options, config.connection);
  const conn = resolveTraceConnectionConfig(resolvedOptions);

  Logger.info('Clearing all trace entries...');
  if (isD1ConnectionDriver(conn.driver)) {
    executeD1Delete(options, 'DELETE FROM zin_trace_entries');
  } else {
    await withSqlTraceStorage(resolvedOptions, async (storage) => storage.clear());
  }
  Logger.info('Done - all entries cleared.');
};

const executeStatus = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
  const { TraceConfig } = await loadTraceModule();

  const config = TraceConfig.merge();
  const resolvedOptions = withConfiguredTraceConnection(options, config.connection);
  const connection = resolveTraceConnectionName(resolvedOptions);
  const conn = resolveTraceConnectionConfig(resolvedOptions);
  const stats = isD1ConnectionDriver(conn.driver)
    ? executeD1Stats(options)
    : await withSqlTraceStorage(resolvedOptions, async (storage) => storage.stats());

  cmd.info(`Trace enabled via env: ${readEnvString('TRACE_ENABLED').trim() || 'false'}`);
  cmd.info(`Connection: ${connection}`);
  cmd.info(`Prune after hours: ${String(config.pruneAfterHours)}`);
  cmd.info(`Expected dashboard URL (if mounted): ${resolveDashboardUrl()}`);

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
    cmd.info('No trace migrations found.');
    return;
  }

  for (const row of rows) {
    const tag = row.status ?? (row.applied ? 'applied' : 'pending');
    const extra = row.applied ? ` (batch=${row.batch ?? '?'}, at=${row.appliedAt ?? '?'})` : '';
    cmd.info(`${tag}: ${row.name}${extra}`);
  }
};

const applyTraceMigrations = async (
  migrator: ReturnType<typeof Migrator.create>,
  cmd: IBaseCommand
): Promise<void> => {
  const result = await migrator.migrate();
  if (result.appliedNames.length === 0) {
    cmd.info('No pending trace migrations.');
    return;
  }

  cmd.success('Trace migrations applied.');
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
    cmd.success('Trace migrations applied (fresh).');
    return;
  }

  if (options['reset'] === true) {
    await migrator.resetAll();
    cmd.success('Trace migrations reset.');
    return;
  }

  if (options['rollback'] === true) {
    const steps = parseRollbackSteps(options);
    const result = await migrator.rollbackLastBatch(steps);
    cmd.success(`Trace migrations rolled back (${result.rolledBack}).`);
    return;
  }

  await applyTraceMigrations(migrator, cmd);
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
    message: 'NODE_ENV=production. Continue running trace migrations?',
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
        'D1-backed trace migrations currently support apply only. Run `zin migrate:trace --local|--remote` without status or rollback flags.'
      );
    }

    const migrationTarget = resolveTraceMigrationTarget();

    const projectRoot = process.cwd();
    const dbName = getD1DatabaseName(options);
    const isLocal = options['local'] === true || options['remote'] !== true;
    const outputDir = path.join(
      projectRoot,
      WranglerConfig.getD1MigrationsDir(projectRoot, dbName)
    );

    await D1SqlMigrations.compileAndWrite({
      projectRoot,
      globalDir: migrationTarget.dir,
      extension: migrationTarget.extension,
      includeGlobal: true,
      outputDir,
    });

    const output = WranglerD1.applyMigrations({ cmd, dbName, isLocal });
    if (output !== '') {
      cmd.info(output);
    }
    cmd.success('Trace D1 migrations applied.');
    return;
  }

  const ormConfig = mapConnectionToOrmConfig(conn);
  const db = Database.create(ormConfig);
  await db.connect();

  try {
    const migrationTarget = resolveTraceMigrationTarget();

    const migrator = Migrator.create({
      db,
      projectRoot: process.cwd(),
      globalDir: migrationTarget.dir,
      extension: migrationTarget.extension,
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

const executeMigrateTrace = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
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
    const selected = readEnvString('TRACE_DB_CONNECTION').trim() || 'default';
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

export const TraceCommands = Object.freeze({
  createTracePruneCommand: (): IBaseCommand =>
    BaseCommand.create({
      name: 'trace:prune',
      description: 'Prune old entries from the trace storage',
      addOptions: addPruneOptions,
      execute: executePrune,
    }),

  createTraceClearCommand: (): IBaseCommand =>
    BaseCommand.create({
      name: 'trace:clear',
      description: 'Clear all entries from the trace storage',
      addOptions: (command: Command): void => {
        command
          .option('--local', 'D1 only: run against local D1 database')
          .option('--remote', 'D1 only: run against remote D1 database')
          .option('--database <name>', 'D1 only: Wrangler D1 database binding name');
      },
      execute: async (options: CommandOptions): Promise<void> => executeClear(options),
    }),

  createTraceStatusCommand: (): IBaseCommand => {
    const cmd = BaseCommand.create({
      name: 'trace:status',
      description: 'Show trace storage stats and dashboard location',
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

  createTraceMigrateCommand: (): IBaseCommand => {
    const cmd = BaseCommand.create({
      name: 'migrate:trace',
      description: 'Run trace package migrations',
      addOptions: addMigrateOptions,
      execute: async (options: CommandOptions): Promise<void> => executeMigrateTrace(options, cmd),
    });

    return cmd;
  },

  createTracePruneProvider: () =>
    createProvider('trace:prune', TraceCommands.createTracePruneCommand),

  createTraceClearProvider: () =>
    createProvider('trace:clear', TraceCommands.createTraceClearCommand),

  createTraceStatusProvider: () =>
    createProvider('trace:status', TraceCommands.createTraceStatusCommand),

  createTraceMigrateProvider: () =>
    createProvider('migrate:trace', TraceCommands.createTraceMigrateCommand),
});
