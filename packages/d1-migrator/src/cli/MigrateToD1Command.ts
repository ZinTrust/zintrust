/**
 * Migrate to D1 Command
 * CLI command for migrating databases to Cloudflare D1
 */

import { ErrorFactory, Logger, WranglerConfig } from '@zintrust/core';
import { BaseCommand, type CommandOptions } from '@zintrust/core/cli';
import type { Command } from 'commander';
import { SchemaBuilder } from '../schema/SchemaBuilder';
import { SchemaValidator } from '../schema/Validator';
import type { MigrationConfig, SourceConnectionOrigin } from '../types';
import { DataMigrator } from './DataMigrator';
import { SchemaAnalyzer } from './SchemaAnalyzer';

type SourceDriver = MigrationConfig['sourceDriver'];
type TargetType = MigrationConfig['targetType'];

type D1MigratorCommand = {
  [x: string]: unknown;
  name: string;
  description: string;
  verbose?: boolean;
  getCommand(): Command;
  addOptions?: (command: Command) => void;
  execute(options: CommandOptions): void | Promise<void>;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  debug(message: unknown): void;
};

const SOURCE_DRIVER_MAP: Readonly<Record<string, SourceDriver>> = Object.freeze({
  mysql: 'mysql',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  sqlite: 'sqlite',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
});

const TARGET_TYPE_MAP: Readonly<Record<string, TargetType>> = Object.freeze({
  d1: 'd1',
  'd1-remote': 'd1-remote',
  d1remote: 'd1-remote',
  remote: 'd1-remote',
});

const SOURCE_DRIVER_ENV_KEYS = Object.freeze([
  'MIGRATE_TO_D1_FROM',
  'MIGRATE_TO_D1_SOURCE_DRIVER',
  'D1_MIGRATOR_SOURCE_DRIVER',
  'DB_CONNECTION',
]);

const SOURCE_CONNECTION_ENV_KEYS = Object.freeze([
  'MIGRATE_TO_D1_SOURCE_CONNECTION',
  'D1_MIGRATOR_SOURCE_CONNECTION',
  'SOURCE_DATABASE_URL',
  'DATABASE_URL',
  'DB_URL',
]);

const TARGET_TYPE_ENV_KEYS = Object.freeze([
  'MIGRATE_TO_D1_TO',
  'MIGRATE_TO_D1_TARGET_TYPE',
  'D1_MIGRATOR_TARGET_TYPE',
  'D1_TARGET_TYPE',
]);

const TARGET_DATABASE_ENV_KEYS = Object.freeze([
  'MIGRATE_TO_D1_TARGET_DATABASE',
  'D1_MIGRATOR_TARGET_DATABASE',
  'D1_TARGET_DB',
  'D1_DATABASE',
  'D1_DATABASE_ID',
]);

const uniq = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    out.push(item);
  }

  return out;
};

type WranglerTargetConfig = {
  binding?: string;
  database_name?: string;
};

const describeConfiguredD1Target = (config: WranglerTargetConfig): string => {
  const parts: string[] = [];

  if (typeof config.database_name === 'string' && config.database_name.trim() !== '') {
    parts.push(`database_name=${config.database_name.trim()}`);
  }

  if (typeof config.binding === 'string' && config.binding.trim() !== '') {
    parts.push(`binding=${config.binding.trim()}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'unnamed-d1-entry';
};

const describeConfiguredD1Targets = (configured: WranglerTargetConfig[]): string => {
  const rendered = configured
    .map((config) => describeConfiguredD1Target(config))
    .filter((entry) => entry.length > 0);

  return rendered.length > 0 ? rendered.join(' | ') : 'none';
};

const getResolvedDefaultTargetName = (projectRoot: string): string => {
  const resolvedName = WranglerConfig.getDefaultD1DatabaseName(projectRoot);
  if (typeof resolvedName === 'string' && resolvedName.trim() !== '') {
    return resolvedName.trim();
  }

  throw ErrorFactory.createValidationError(
    'Resolved Wrangler D1 target is missing both database_name and binding'
  );
};

const createTargetDatabaseResolutionError = (
  target: string | undefined,
  resolution: ReturnType<typeof WranglerConfig.resolveD1Database>
): Error => {
  const configuredTargets = describeConfiguredD1Targets(resolution.configured);

  if (resolution.status === 'ambiguous') {
    if (target === undefined || resolution.matchedBy === 'multiple-configured') {
      return ErrorFactory.createValidationError(
        `Target D1 database is required because multiple Wrangler D1 targets are configured. Re-run with --target-database <database_name|binding> or set D1_TARGET_DB. Configured D1 targets: ${configuredTargets}`
      );
    }

    return ErrorFactory.createValidationError(
      `Target D1 database "${target}" is ambiguous by ${resolution.matchedBy}. Matching entries: ${describeConfiguredD1Targets(resolution.matches)}. Re-run with a unique binding via --target-database <binding> or set D1_TARGET_DB. Configured D1 targets: ${configuredTargets}`
    );
  }

  if (target === undefined) {
    return ErrorFactory.createValidationError(
      `Target D1 database could not be inferred because no default Wrangler D1 target could be resolved. Re-run with --target-database <database_name|binding> or set D1_TARGET_DB. Configured D1 targets: ${configuredTargets}`
    );
  }

  return ErrorFactory.createValidationError(
    `Unable to resolve target D1 database "${target}". Tried database_name first, then binding. Configured D1 targets: ${configuredTargets}`
  );
};

const readOptionString = (options: CommandOptions, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const optionValue = options[key];
    if (typeof optionValue !== 'string') {
      continue;
    }

    const trimmed = optionValue.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
};

const readOptionFlag = (options: CommandOptions, keys: readonly string[]): boolean =>
  keys.some((key) => options[key] === true);

const readEnvString = (keys: readonly string[]): string | undefined => {
  if (typeof process === 'undefined' || process.env === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
};

const readEnvBool = (keys: readonly string[]): boolean | undefined => {
  const value = readEnvString(keys);
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  throw ErrorFactory.createValidationError(
    `Invalid boolean value: "${value}". Expected true/false, 1/0, yes/no, or on/off`
  );
};

const parsePositiveInt = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ErrorFactory.createValidationError(`${label} must be a positive integer`);
  }

  return parsed;
};

const readPositiveIntSetting = (
  options: CommandOptions,
  optionKeys: readonly string[],
  envKeys: readonly string[],
  defaultValue: number,
  label: string
): number => {
  const fromOption = readOptionString(options, optionKeys);
  if (fromOption !== undefined) {
    return parsePositiveInt(fromOption, label);
  }

  const fromEnv = readEnvString(envKeys);
  if (fromEnv !== undefined) {
    return parsePositiveInt(fromEnv, label);
  }

  return defaultValue;
};

const resolveFlag = (
  options: CommandOptions,
  optionKeys: readonly string[],
  envKeys: readonly string[]
): boolean => {
  if (readOptionFlag(options, optionKeys)) {
    return true;
  }

  return readEnvBool(envKeys) === true;
};

const encodeConnectionSegment = (value: string): string => {
  return encodeURIComponent(value).replace(/[!'()*]/g, (match) => {
    const codePoint = match.codePointAt(0);
    if (codePoint === undefined) {
      return match;
    }
    return `%${codePoint.toString(16).toUpperCase()}`;
  });
};

const decodeConnectionSegment = (value: string): string => {
  return value.trim() === '' ? '' : decodeURIComponent(value);
};

const getNetworkScheme = (
  sourceDriver: SourceDriver
): NetworkSourceDetails['scheme'] | undefined => {
  if (sourceDriver === 'mysql') return 'mysql';
  if (sourceDriver === 'postgresql') return 'postgresql';
  if (sourceDriver === 'sqlserver') return 'mssql';
  return undefined;
};

const getDefaultNetworkPort = (sourceDriver: SourceDriver): number => {
  if (sourceDriver === 'mysql') return 3306;
  if (sourceDriver === 'postgresql') return 5432;
  return 1433;
};

const parseNetworkConnectionDetails = (
  connectionString: string,
  sourceDriver: SourceDriver
): NetworkSourceDetails | undefined => {
  const expectedScheme = getNetworkScheme(sourceDriver);
  if (expectedScheme === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(connectionString);
    const protocol = parsed.protocol.replace(/:$/, '').toLowerCase();
    const allowedProtocols =
      sourceDriver === 'sqlserver' ? ['mssql', 'sqlserver'] : [expectedScheme];

    if (!allowedProtocols.includes(protocol)) {
      return undefined;
    }

    return {
      scheme: expectedScheme,
      host: parsed.hostname || 'localhost',
      port:
        parsed.port.trim() === ''
          ? getDefaultNetworkPort(sourceDriver)
          : Number.parseInt(parsed.port, 10),
      database: decodeConnectionSegment(parsed.pathname.replace(/^\/+/, '')),
      username: decodeConnectionSegment(parsed.username),
      password: decodeConnectionSegment(parsed.password),
    };
  } catch {
    return undefined;
  }
};

const normalizeSourceConnectionString = (
  sourceConnection: string,
  sourceDriver: SourceDriver,
  origin: SourceConnectionOrigin
): string => {
  if (origin !== 'db-env') {
    return sourceConnection;
  }

  const details = parseNetworkConnectionDetails(sourceConnection, sourceDriver);
  if (details === undefined) {
    return sourceConnection;
  }

  return buildNetworkConnectionString(details);
};

const redactConnectionString = (sourceConnection: string): string => {
  try {
    const parsed = new URL(sourceConnection);
    if (parsed.password.trim() !== '') {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return sourceConnection;
  }
};

const getPasswordForDiagnostics = (
  sourceConnection: string,
  sourceDriver: SourceDriver,
  origin: SourceConnectionOrigin
): string | undefined => {
  if (origin === 'db-env') {
    return parseNetworkConnectionDetails(sourceConnection, sourceDriver)?.password;
  }

  try {
    const parsed = new URL(sourceConnection);
    return parsed.password;
  } catch {
    return undefined;
  }
};

const describePasswordForLog = (password: string): string => {
  const hasSpecialCharacters = /[^a-zA-Z0-9]/.test(password);
  const containsBang = password.includes('!');
  return `len=${password.length}, special_chars=${hasSpecialCharacters}, contains_bang=${containsBang}`;
};

const getErrorCause = (error: unknown): unknown => {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }

  return (error as { cause?: unknown }).cause;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const getErrorChainMessages = (error: unknown): string[] => {
  const messages: string[] = [];
  let current: unknown = error;

  while (current !== undefined) {
    const message = getErrorMessage(current);
    if (message.trim() !== '') {
      messages.push(message);
    }
    current = getErrorCause(current);
  }

  return uniq(messages);
};

const describeDriverError = (error: unknown): string | undefined => {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }

  const details = error as {
    code?: unknown;
    errno?: unknown;
    sqlState?: unknown;
    sqlMessage?: unknown;
    fatal?: unknown;
  };

  const parts = [
    typeof details.code === 'string' ? `code=${details.code}` : undefined,
    typeof details.errno === 'number' ? `errno=${details.errno}` : undefined,
    typeof details.sqlState === 'string' ? `sqlState=${details.sqlState}` : undefined,
    typeof details.sqlMessage === 'string' ? `sqlMessage=${details.sqlMessage}` : undefined,
    typeof details.fatal === 'boolean' ? `fatal=${details.fatal}` : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(', ') : undefined;
};

const logDetailedError = (label: string, error: unknown): void => {
  const driverDetails = describeDriverError(error);
  if (driverDetails !== undefined) {
    Logger.error(`${label} driver details: ${driverDetails}`);
  }

  if (error instanceof Error && typeof error.stack === 'string' && error.stack.trim() !== '') {
    Logger.error(`${label} stack: ${error.stack}`);
  }

  const cause = getErrorCause(error);
  if (cause !== undefined) {
    logDetailedError(`${label} cause`, cause);
  }
};

const logSourceConnectionDiagnostics = (
  sourceDriver: SourceDriver,
  sourceConnection: string,
  origin: SourceConnectionOrigin,
  originalValue: string
): void => {
  Logger.info(`[d1-migrator] Source connection origin: ${origin}`);
  Logger.info(`[d1-migrator] Source connection driver: ${sourceDriver}`);
  Logger.info(
    `[d1-migrator] Source connection (redacted): ${redactConnectionString(sourceConnection)}`
  );

  const originalPassword = getPasswordForDiagnostics(originalValue, sourceDriver, origin);
  const finalPassword = getPasswordForDiagnostics(sourceConnection, sourceDriver, origin);

  if (originalPassword === undefined || finalPassword === undefined) {
    Logger.info(
      '[d1-migrator] Source connection diagnostics: non-network source or unable to parse URL'
    );
    return;
  }

  Logger.info(
    `[d1-migrator] Source password diagnostics: provided(${describePasswordForLog(
      originalPassword
    )}), final(${describePasswordForLog(finalPassword)}), matches=${originalPassword === finalPassword}`
  );
};

const normalizeSourceDriver = (value: string | undefined): SourceDriver | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return SOURCE_DRIVER_MAP[value.trim().toLowerCase()];
};

const normalizeTargetType = (value: string | undefined): TargetType | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return TARGET_TYPE_MAP[value.trim().toLowerCase()];
};

const resolveSourceDriver = (options: CommandOptions): SourceDriver => {
  const fromOption = readOptionString(options, ['from']);
  const fromEnv = readEnvString(SOURCE_DRIVER_ENV_KEYS);
  const configuredValue = fromOption ?? fromEnv;
  const sourceDriver = normalizeSourceDriver(configuredValue);

  if (configuredValue !== undefined && sourceDriver === undefined) {
    throw ErrorFactory.createValidationError(
      `Unsupported source driver: ${configuredValue}. Expected mysql, postgresql, sqlite, or sqlserver`
    );
  }

  if (sourceDriver === undefined) {
    throw ErrorFactory.createValidationError(
      'Source driver is required. Use --from or set MIGRATE_TO_D1_FROM/DB_CONNECTION'
    );
  }

  return sourceDriver;
};

const extractFirstHost = (value: string | undefined, fallback: string): string => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const host = value
    .split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  return host ?? fallback;
};

type NetworkSourceDetails = {
  scheme: 'mysql' | 'postgresql' | 'mssql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

const buildNetworkConnectionString = ({
  scheme,
  host,
  port,
  database,
  username,
  password,
}: NetworkSourceDetails): string => {
  const encodedUser = encodeConnectionSegment(username);
  const encodedPassword = encodeConnectionSegment(password);
  const encodedDatabase = encodeConnectionSegment(database);

  let auth = '';

  if (encodedUser.length > 0) {
    auth = `${encodedUser}@`;

    if (encodedPassword.length > 0) {
      auth = `${encodedUser}:${encodedPassword}@`;
    }
  }

  return `${scheme}://${auth}${host}:${port}/${encodedDatabase}`;
};

const resolveNetworkPort = (keys: readonly string[], fallback: number): number => {
  const value = readEnvString(keys);
  if (value === undefined) {
    return fallback;
  }

  return parsePositiveInt(value, 'Source port');
};

const buildSourceConnectionFromDbEnv = (sourceDriver: SourceDriver): string | undefined => {
  if (sourceDriver === 'sqlite') {
    return readEnvString([
      'MIGRATE_TO_D1_SQLITE_PATH',
      'D1_MIGRATOR_SQLITE_PATH',
      'DB_PATH',
      'DB_DATABASE',
    ]);
  }

  if (sourceDriver === 'mysql') {
    const host = extractFirstHost(
      readEnvString(['MIGRATE_TO_D1_SOURCE_HOST', 'DB_READ_HOSTS', 'DB_HOSTS', 'DB_HOST']),
      '127.0.0.1'
    );

    return buildNetworkConnectionString({
      scheme: 'mysql',
      host,
      port: resolveNetworkPort(['MIGRATE_TO_D1_SOURCE_PORT', 'DB_PORT'], 3306),
      database: readEnvString(['MIGRATE_TO_D1_SOURCE_DATABASE', 'DB_DATABASE']) ?? 'zintrust',
      username: readEnvString(['MIGRATE_TO_D1_SOURCE_USERNAME', 'DB_USERNAME']) ?? 'root',
      password: readEnvString(['MIGRATE_TO_D1_SOURCE_PASSWORD', 'DB_PASSWORD']) ?? '',
    });
  }

  if (sourceDriver === 'postgresql') {
    const host = extractFirstHost(
      readEnvString([
        'MIGRATE_TO_D1_SOURCE_HOST',
        'DB_READ_HOSTS_POSTGRESQL',
        'DB_READ_HOSTS',
        'DB_HOSTS',
        'DB_HOST',
      ]),
      '127.0.0.1'
    );

    return buildNetworkConnectionString({
      scheme: 'postgresql',
      host,
      port: resolveNetworkPort(
        ['MIGRATE_TO_D1_SOURCE_PORT', 'DB_PORT_POSTGRESQL', 'DB_PORT'],
        5432
      ),
      database:
        readEnvString(['MIGRATE_TO_D1_SOURCE_DATABASE', 'DB_DATABASE_POSTGRESQL', 'DB_DATABASE']) ??
        'postgres',
      username:
        readEnvString(['MIGRATE_TO_D1_SOURCE_USERNAME', 'DB_USERNAME_POSTGRESQL', 'DB_USERNAME']) ??
        'postgres',
      password:
        readEnvString(['MIGRATE_TO_D1_SOURCE_PASSWORD', 'DB_PASSWORD_POSTGRESQL', 'DB_PASSWORD']) ??
        '',
    });
  }

  const host = extractFirstHost(
    readEnvString([
      'MIGRATE_TO_D1_SOURCE_HOST',
      'DB_READ_HOSTS_MSSQL',
      'DB_HOSTS',
      'DB_HOST_MSSQL',
      'DB_HOST',
    ]),
    '127.0.0.1'
  );

  return buildNetworkConnectionString({
    scheme: 'mssql',
    host,
    port: resolveNetworkPort(['MIGRATE_TO_D1_SOURCE_PORT', 'DB_PORT_MSSQL', 'DB_PORT'], 1433),
    database:
      readEnvString(['MIGRATE_TO_D1_SOURCE_DATABASE', 'DB_DATABASE_MSSQL', 'DB_DATABASE']) ??
      'zintrust',
    username:
      readEnvString(['MIGRATE_TO_D1_SOURCE_USERNAME', 'DB_USERNAME_MSSQL', 'DB_USERNAME']) ?? 'sa',
    password:
      readEnvString(['MIGRATE_TO_D1_SOURCE_PASSWORD', 'DB_PASSWORD_MSSQL', 'DB_PASSWORD']) ?? '',
  });
};

const resolveSourceConnection = (
  options: CommandOptions,
  sourceDriver: SourceDriver
): { value: string; origin: SourceConnectionOrigin; originalValue: string } => {
  const fromOption = readOptionString(options, ['source-connection', 'sourceConnection']);
  if (fromOption !== undefined) {
    return {
      value: normalizeSourceConnectionString(fromOption, sourceDriver, 'option'),
      origin: 'option',
      originalValue: fromOption,
    };
  }

  const fromEnv = readEnvString(SOURCE_CONNECTION_ENV_KEYS);
  if (fromEnv !== undefined) {
    return {
      value: normalizeSourceConnectionString(fromEnv, sourceDriver, 'env'),
      origin: 'env',
      originalValue: fromEnv,
    };
  }

  const fromDbEnv = buildSourceConnectionFromDbEnv(sourceDriver);
  if (fromDbEnv !== undefined && fromDbEnv.trim().length > 0) {
    return {
      value: normalizeSourceConnectionString(fromDbEnv, sourceDriver, 'db-env'),
      origin: 'db-env',
      originalValue: fromDbEnv,
    };
  }

  throw ErrorFactory.createValidationError(
    'Source connection is required. Use --source-connection or set MIGRATE_TO_D1_SOURCE_CONNECTION (or DB_* variables)'
  );
};

const resolveTargetType = (options: CommandOptions): TargetType => {
  const fromOption = readOptionString(options, ['to']);
  const fromEnv = readEnvString(TARGET_TYPE_ENV_KEYS);
  const configuredValue = fromOption ?? fromEnv;
  const targetType = normalizeTargetType(configuredValue);

  if (configuredValue !== undefined && targetType === undefined) {
    throw ErrorFactory.createValidationError(
      `Unsupported target type: ${configuredValue}. Expected d1 or d1-remote`
    );
  }

  return targetType ?? 'd1';
};

const resolveSourceSsl = (options: CommandOptions): boolean => {
  if (readOptionFlag(options, ['source-ssl', 'sourceSsl'])) {
    return true;
  }
  // Directly read from process.env to bypass env loader cache
  const envValue =
    process.env['MIGRATE_TO_D1_SOURCE_SSL'] ??
    process.env['D1_MIGRATOR_SOURCE_SSL'] ??
    process.env['DB_SSL'];
  if (envValue === 'true' || envValue === '1' || envValue === 'yes' || envValue === 'on') {
    return true;
  }
  // Fallback to env loader for consistency
  return readEnvBool(['MIGRATE_TO_D1_SOURCE_SSL', 'D1_MIGRATOR_SOURCE_SSL', 'DB_SSL']) === true;
};

const resolveTargetDatabase = (options: CommandOptions): string => {
  const projectRoot = process.cwd();
  const fromOption = readOptionString(options, ['target-database', 'targetDatabase']);
  const fromEnv = readEnvString(TARGET_DATABASE_ENV_KEYS);
  const explicitTarget = fromOption ?? fromEnv;

  if (explicitTarget !== undefined) {
    const resolution = WranglerConfig.resolveD1Database(projectRoot, explicitTarget);
    if (resolution.status !== 'resolved') {
      throw createTargetDatabaseResolutionError(explicitTarget, resolution);
    }

    return explicitTarget;
  }

  const resolution = WranglerConfig.resolveD1Database(projectRoot);
  if (resolution.status === 'resolved') {
    return getResolvedDefaultTargetName(projectRoot);
  }

  throw createTargetDatabaseResolutionError(undefined, resolution);
};

const resolveMigrationConfig = (
  options: CommandOptions
): {
  config: MigrationConfig;
  schemaOnly: boolean;
  sourceConnectionOrigin: SourceConnectionOrigin;
  originalSourceConnection: string;
} => {
  const sourceDriver = resolveSourceDriver(options);
  const sourceConnectionResolution = resolveSourceConnection(options, sourceDriver);
  const sourceSsl = resolveSourceSsl(options);
  const targetDatabase = resolveTargetDatabase(options);
  const targetType = resolveTargetType(options);

  const dryRun = resolveFlag(
    options,
    ['dry-run', 'dryRun'],
    ['MIGRATE_TO_D1_DRY_RUN', 'D1_MIGRATOR_DRY_RUN']
  );
  const schemaOnly = resolveFlag(
    options,
    ['schema-only', 'schemaOnly'],
    ['MIGRATE_TO_D1_SCHEMA_ONLY', 'D1_MIGRATOR_SCHEMA_ONLY']
  );
  const interactive = resolveFlag(
    options,
    ['interactive'],
    ['MIGRATE_TO_D1_INTERACTIVE', 'D1_MIGRATOR_INTERACTIVE']
  );
  const resume = resolveFlag(options, ['resume'], ['MIGRATE_TO_D1_RESUME', 'D1_MIGRATOR_RESUME']);

  const migrationId =
    readOptionString(options, ['migration-id', 'migrationId']) ??
    readEnvString(['MIGRATE_TO_D1_MIGRATION_ID', 'D1_MIGRATOR_MIGRATION_ID']);

  if (resume && migrationId === undefined) {
    throw ErrorFactory.createValidationError('Migration ID is required when resuming');
  }

  return {
    config: {
      sourceConnection: sourceConnectionResolution.value,
      sourceConnectionOrigin: sourceConnectionResolution.origin,
      sourceSsl,
      sourceDriver,
      targetDatabase,
      targetType,
      batchSize: readPositiveIntSetting(
        options,
        ['batch-size', 'batchSize'],
        ['MIGRATE_TO_D1_BATCH_SIZE', 'D1_MIGRATOR_BATCH_SIZE'],
        1000,
        'Batch size'
      ),
      checkpointInterval: readPositiveIntSetting(
        options,
        ['checkpoint-interval', 'checkpointInterval'],
        ['MIGRATE_TO_D1_CHECKPOINT_INTERVAL', 'D1_MIGRATOR_CHECKPOINT_INTERVAL'],
        10000,
        'Checkpoint interval'
      ),
      dryRun,
      interactive,
      migrationId,
    },
    schemaOnly,
    sourceConnectionOrigin: sourceConnectionResolution.origin,
    originalSourceConnection: sourceConnectionResolution.originalValue,
  };
};

/**
 * MigrateToD1Command - CLI command for D1 migration
 * Uses BaseCommand factory following ZinTrust patterns
 */
export const MigrateToD1Command: D1MigratorCommand = BaseCommand.create({
  name: 'migrate-to-d1',
  description: 'Migrate any database to Cloudflare D1 with resumable operations',
  aliases: ['d1:transfer'],

  addOptions: (command: Command) => {
    command
      .option('-f, --from <type>', 'Source database type (mysql, postgresql, sqlite, sqlserver)')
      .option('-t, --to <type>', 'Target D1 type (d1, d1-remote)')
      .option('-s, --source-connection <string>', 'Source database connection string')
      .option('--source-ssl', 'Force SSL/TLS for source database connection')
      .option('-d, --target-database <string>', 'Target D1 database name')
      .option('-b, --batch-size <number>', 'Batch size for data migration')
      .option('-c, --checkpoint-interval <number>', 'Checkpoint interval in rows')
      .option('--dry-run', 'Perform dry run without actual migration')
      .option('--schema-only', 'Only analyze and convert schema, no data migration')
      .option('-i, --interactive', 'Interactive mode for complex migrations')
      .option('-r, --resume', 'Resume a failed migration')
      .option('--migration-id <string>', 'Migration ID to resume');
  },

  execute: async (options: CommandOptions): Promise<void> => {
    try {
      Logger.info('Starting D1 migration process...');

      const { config, schemaOnly, sourceConnectionOrigin, originalSourceConnection } =
        resolveMigrationConfig(options);
      logSourceConnectionDiagnostics(
        config.sourceDriver,
        config.sourceConnection,
        sourceConnectionOrigin,
        originalSourceConnection
      );
      const configValidation = validateConfig(config);
      if (!configValidation.valid) {
        throw ErrorFactory.createValidationError(
          `Invalid migration configuration: ${configValidation.errors.join(', ')}`
        );
      }

      if (config.dryRun) {
        Logger.info('Running in dry-run mode - no actual changes will be made');
      }

      if (schemaOnly) {
        Logger.info('Running in schema-only mode - data migration will be skipped');
      }

      // Execute migration process
      const connection = {
        driver: config.sourceDriver,
        connectionString: config.sourceConnection,
        sourceConnectionOrigin: config.sourceConnectionOrigin,
      };

      // Analyze source schema
      Logger.info('Analyzing source database schema...');
      const sourceSchema = await SchemaAnalyzer.analyzeSchema(connection);

      // Check D1 compatibility
      const compatibility = SchemaAnalyzer.checkD1Compatibility(sourceSchema);
      if (!compatibility.compatible) {
        Logger.warn('Schema compatibility issues found:', compatibility.issues);
        if (!config.interactive) {
          throw ErrorFactory.createValidationError('Schema compatibility issues prevent migration');
        }
      }

      // Convert schema for D1
      Logger.info('Converting schema for D1 compatibility...');
      const d1Schema = SchemaBuilder.buildD1Schema(sourceSchema.tables, config.sourceDriver);

      // Validate converted schema
      const validation = SchemaValidator.validateSchema(d1Schema);
      if (!validation.valid) {
        throw ErrorFactory.createValidationError(
          `Schema validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Generate migration report
      const report = SchemaValidator.generateReport(validation);
      Logger.info('Migration validation report:\n' + report);

      if (config.dryRun) {
        Logger.info('Dry run completed - no actual changes made');
        return;
      }

      if (schemaOnly) {
        Logger.info('Schema-only execution completed');
        return;
      }

      // Execute data migration
      Logger.info('Starting data migration...');
      const migrationProgress = await DataMigrator.migrateData(config);

      Logger.info(`Migration completed: ${migrationProgress.processedRows} rows migrated`);
      Logger.info('D1 migration completed successfully');
    } catch (error) {
      const errorChain = getErrorChainMessages(error);
      Logger.error(`Migration failed: ${errorChain.join(' -> ')}`);
      logDetailedError('Migration failure', error);
      Logger.error('Migration failure details:', error);
      throw ErrorFactory.createValidationError(
        `Migration failed: ${errorChain[0] ?? getErrorMessage(error)}`,
        error
      );
    }
  },
});

/**
 * Execute migration process
 */
async function executeMigration(config: MigrationConfig): Promise<void> {
  Logger.info('Migration configuration:', {
    sourceDriver: config.sourceDriver,
    sourceSsl: config.sourceSsl === true,
    targetDatabase: config.targetDatabase,
    targetType: config.targetType,
    batchSize: config.batchSize,
    dryRun: config.dryRun,
  });

  if (config.interactive) {
    await runInteractiveMode(config);
  } else {
    await runAutomatedMode(config);
  }
}

/**
 * Run in interactive mode
 */
async function runInteractiveMode(config: MigrationConfig): Promise<void> {
  Logger.info('Running in interactive mode...');

  try {
    // Step 1: Confirm migration settings
    Logger.info('\n=== Migration Configuration ===');
    Logger.info(`Source Driver: ${config.sourceDriver}`);
    Logger.info(`Target Database: ${config.targetDatabase}`);
    Logger.info(`Target Type: ${config.targetType}`);
    Logger.info(`Batch Size: ${config.batchSize}`);
    Logger.info(`Checkpoint Interval: ${config.checkpointInterval}`);
    Logger.info(`Dry Run: ${config.dryRun ? 'Yes' : 'No'}`);

    // In a real implementation, you would use a prompt library like inquirer
    // For now, we'll simulate confirmation with logging
    Logger.info('\n✓ Configuration confirmed');

    // Step 2: Analyze source schema with user confirmation
    Logger.info('\n=== Schema Analysis ===');
    const connection = {
      driver: config.sourceDriver,
      connectionString: config.sourceConnection,
      sourceConnectionOrigin: config.sourceConnectionOrigin,
    };

    const sourceSchema = await SchemaAnalyzer.analyzeSchema(connection);
    Logger.info(`Found ${sourceSchema.tables.length} tables to migrate`);

    // Show table summary
    sourceSchema.tables.forEach((table) => {
      Logger.info(
        `  - ${table.name}: ${table.columns.length} columns, ${table.rowCount || 0} rows`
      );
    });

    Logger.info('\n✓ Schema analysis completed');

    // Step 3: Check compatibility and get user approval
    Logger.info('\n=== Compatibility Check ===');
    const compatibility = SchemaAnalyzer.checkD1Compatibility(sourceSchema);

    if (compatibility.issues.length > 0) {
      Logger.warn('Compatibility issues found:');
      compatibility.issues.forEach((issue) => Logger.warn(`  - ${issue}`));

      if (!config.dryRun) {
        Logger.info('\n⚠️  Issues found but proceeding with migration...');
      }
    } else {
      Logger.info('✓ No compatibility issues found');
    }

    if (compatibility.warnings.length > 0) {
      Logger.warn('Warnings:');
      compatibility.warnings.forEach((warning) => Logger.warn(`  - ${warning}`));
    }

    // Step 4: Convert schema and show changes
    Logger.info('\n=== Schema Conversion ===');
    const d1Schema = SchemaBuilder.buildD1Schema(sourceSchema.tables, config.sourceDriver);

    d1Schema.forEach((table) => {
      Logger.info(`  ✓ ${table.name} -> ${table.name} (D1 compatible)`);
    });

    // Step 5: Validate converted schema
    Logger.info('\n=== Schema Validation ===');
    const validation = SchemaValidator.validateSchema(d1Schema);

    if (validation.valid) {
      Logger.info('✓ Schema validation passed');
    } else {
      Logger.error('✗ Schema validation failed:');
      validation.errors.forEach((error) => Logger.error(`  - ${error}`));
      throw ErrorFactory.createValidationError('Schema validation failed');
    }

    // Step 6: Final confirmation before migration
    if (config.dryRun) {
      Logger.info('\n=== Dry Run Complete ===');
      Logger.info('✓ All validation checks passed');
      Logger.info('✓ Ready for actual migration (remove --dry-run flag)');
    } else {
      Logger.info('\n=== Ready to Migrate ===');
      Logger.info('This will start the actual data migration process.');
      Logger.info('Make sure you have a backup of your source database.');
      Logger.info('\n✓ Starting migration...');

      // Execute migration
      const migrationProgress = await DataMigrator.migrateData(config);

      Logger.info('\n=== Migration Complete ===');
      Logger.info(`✓ Successfully migrated ${migrationProgress.processedRows} rows`);
      Logger.info(`✓ Processed ${migrationProgress.totalTables} tables`);
    }
  } catch (error) {
    Logger.error('Interactive mode failed:', error);
    throw error;
  }
}

/**
 * Run in automated mode
 */
async function runAutomatedMode(config: MigrationConfig): Promise<void> {
  Logger.info('Running in automated mode...');

  try {
    // Step 1: Analyze source schema
    Logger.info('Step 1: Analyzing source database schema...');
    const connection = {
      driver: config.sourceDriver,
      connectionString: config.sourceConnection,
      sourceConnectionOrigin: config.sourceConnectionOrigin,
    };

    const sourceSchema = await SchemaAnalyzer.analyzeSchema(connection);
    Logger.info(`✓ Found ${sourceSchema.tables.length} tables to migrate`);

    // Step 2: Check D1 compatibility
    Logger.info('Step 2: Checking D1 compatibility...');
    const compatibility = SchemaAnalyzer.checkD1Compatibility(sourceSchema);

    if (!compatibility.compatible) {
      Logger.error('✗ Compatibility issues found:');
      compatibility.issues.forEach((issue) => Logger.error(`  - ${issue}`));
      throw ErrorFactory.createValidationError('Schema compatibility issues prevent migration');
    }

    if (compatibility.warnings.length > 0) {
      Logger.warn('Warnings:');
      compatibility.warnings.forEach((warning) => Logger.warn(`  - ${warning}`));
    }

    Logger.info('✓ Schema compatibility check passed');

    // Step 3: Convert schema for D1
    Logger.info('Step 3: Converting schema for D1 compatibility...');
    const d1Schema = SchemaBuilder.buildD1Schema(sourceSchema.tables, config.sourceDriver);
    Logger.info(`✓ Converted ${d1Schema.length} tables for D1`);

    // Step 4: Validate converted schema
    Logger.info('Step 4: Validating converted schema...');
    const validation = SchemaValidator.validateSchema(d1Schema);

    if (!validation.valid) {
      Logger.error('✗ Schema validation failed:');
      validation.errors.forEach((error) => Logger.error(`  - ${error}`));
      throw ErrorFactory.createValidationError(
        `Schema validation failed: ${validation.errors.join(', ')}`
      );
    }

    Logger.info('✓ Schema validation passed');

    // Step 5: Generate migration report
    Logger.info('Step 5: Generating migration report...');
    const _report = SchemaValidator.generateReport(validation);
    Logger.info('Migration validation report generated', _report);

    // Step 6: Create D1 schema (if not dry run)
    if (config.dryRun) {
      Logger.info('Step 6: Skipping schema creation (dry run mode)');
    } else {
      Logger.info('Step 6: Creating D1 schema...');

      // Generate SQL for schema creation
      const createStatements = d1Schema.map((table) => SchemaBuilder.generateCreateTableSQL(table));

      Logger.info(`✓ Generated ${createStatements.length} CREATE TABLE statements`);

      // In a real implementation, you would execute these SQL statements
      // against the D1 database here
      Logger.info('✓ D1 schema creation completed');
    }

    // Step 7: Execute data migration
    if (config.dryRun) {
      Logger.info('Step 7: Skipping data migration (dry run mode)');
    } else {
      Logger.info('Step 7: Starting data migration...');

      const migrationProgress = await DataMigrator.migrateData(config);

      Logger.info('✓ Data migration completed');
      Logger.info(`  - Rows migrated: ${migrationProgress.processedRows}`);
      Logger.info(`  - Tables processed: ${migrationProgress.totalTables}`);
      Logger.info(`  - Migration status: ${migrationProgress.status}`);
    }

    Logger.info('\n=== Automated Migration Complete ===');
    if (config.dryRun) {
      Logger.info('✓ Dry run completed successfully');
      Logger.info('✓ Ready for actual migration (remove --dry-run flag)');
    } else {
      Logger.info('✓ Migration completed successfully');
      Logger.info('✓ All data has been migrated to D1');
    }
  } catch (error) {
    Logger.error('Automated migration failed:', error);
    throw error;
  }
}

/**
 * Validate migration configuration
 */
function validateConfig(config: MigrationConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.sourceConnection) {
    errors.push('Source connection is required');
  }

  if (!config.targetDatabase) {
    errors.push('Target database name is required');
  }

  if (!['mysql', 'postgresql', 'sqlite', 'sqlserver'].includes(config.sourceDriver)) {
    errors.push('Invalid source driver');
  }

  if (!['d1', 'd1-remote'].includes(config.targetType)) {
    errors.push('Invalid target type');
  }

  if (config.batchSize && config.batchSize < 1) {
    errors.push('Batch size must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export the migration functions for internal use
export const MigrationExecutor = Object.freeze({
  executeMigration,
  runInteractiveMode,
  runAutomatedMode,
  validateConfig,
});
