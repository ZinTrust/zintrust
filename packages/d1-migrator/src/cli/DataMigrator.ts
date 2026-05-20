/* eslint-disable no-await-in-loop */
/**
 * Data Migrator
 * Handles the actual data migration between databases
 */

import { ErrorFactory, LocalD1Resolver, Logger, WranglerD1 } from '@zintrust/core';

import { MySQLAdapter } from '@zintrust/db-mysql';
import { PostgreSQLAdapter } from '@zintrust/db-postgres';
import { SQLiteAdapter } from '@zintrust/db-sqlite';
import { SQLServerAdapter } from '@zintrust/db-sqlserver';
import { SchemaBuilder } from '../schema/SchemaBuilder';
import { SchemaAnalyzer } from './SchemaAnalyzer';

import type { MigrationConfig, MigrationProgress } from '../types';

/**
 * Database connection types
 */
export interface SourceConnection {
  driver: MigrationConfig['sourceDriver'];
  connectionString: string;
  sourceConnectionOrigin?: MigrationConfig['sourceConnectionOrigin'];
  sourceSsl?: boolean;
  connected: boolean;
  adapter?: DatabaseAdapter;
}

export interface TargetConnection {
  type: 'd1' | 'd1-remote';
  database: string;
  connected: boolean;
  adapter?: DatabaseAdapter;
  remoteBatchTuning?: RemoteBatchTuning;
}

export interface TableInfo {
  name: string;
  rowCount?: number;
  dependsOn?: string[];
}

type InsertStatement = {
  sql: string;
  parameters: unknown[];
  rowCount: number;
};

type RemoteBatchTuning = {
  rowsPerStatement: number;
  maxStatementSqlLength: number;
  maxExecutionSqlLength: number;
};

type InsertBatchSettings = {
  rowsPerStatement: number;
  maxStatementSqlLength: number;
  maxExecutionSqlLength: number;
};

type AdapterQueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number;
};

type DatabaseAdapter = {
  connect(): Promise<void>;
  disconnect?(): Promise<void>;
  query(sql: string, parameters: unknown[]): Promise<AdapterQueryResult>;
};

type MigrationVerificationError = {
  table: string;
  offset: number;
  expectedRows: number;
  insertedRows: number;
};

type ConnectionDetails = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

type WranglerJsonStatementResult = {
  results?: Record<string, unknown>[];
  meta?: {
    changes?: number;
    last_row_id?: number | string;
    rows_read?: number;
    rows_written?: number;
  };
};

const extractWranglerJson = (output: string): WranglerJsonStatementResult[] | null => {
  const trimmed = output.trim();
  if (!trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as WranglerJsonStatementResult[];
  } catch {
    return null;
  }
};

const normalizeWranglerTableValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'null') {
    return null;
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  if (/^-?(?:\d+\.\d+|\d+\.\d*|\.\d+)$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return trimmed;
};

const parseWranglerTable = (output: string): Array<Record<string, string>> => {
  const lines = output.split('\n').map((line) => line.trim());
  const dataLines = lines.filter((line) => line.startsWith('│') && line.endsWith('│'));
  if (dataLines.length < 2) {
    return [];
  }

  const parseCells = (line: string): string[] => {
    return line
      .slice(1, -1)
      .split('│')
      .map((cell) => cell.trim());
  };

  const headers = parseCells(dataLines[0]);
  const rows: Array<Record<string, string>> = [];

  for (const line of dataLines.slice(1)) {
    const cells = parseCells(line);
    if (cells.length !== headers.length) {
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
};

const parseWranglerTableRows = (output: string): Record<string, unknown>[] => {
  return parseWranglerTable(output).map((row) => {
    const normalizedRow: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalizedRow[key] = normalizeWranglerTableValue(value);
    }

    return normalizedRow;
  });
};

const toHex = (value: Uint8Array): string => {
  return Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const toSqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw ErrorFactory.createValidationError('Cannot serialize non-finite number for remote D1');
    }
    return String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  const globalBuffer = globalThis as unknown as {
    Buffer?: { isBuffer(input: unknown): boolean };
  };

  if (globalBuffer.Buffer?.isBuffer(value) === true || value instanceof Uint8Array) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayLike<number>);
    return `X'${toHex(bytes)}'`;
  }

  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
};

const bindSqlParameters = (sql: string, parameters: unknown[]): string => {
  let index = 0;
  return sql.replace(/\?/g, () => {
    if (index >= parameters.length) {
      throw ErrorFactory.createValidationError('Remote D1 SQL parameter count mismatch');
    }

    const rendered = toSqlLiteral(parameters[index]);
    index += 1;
    return rendered;
  });
};

const REMOTE_INSERT_ROWS_PER_STATEMENT = 200;
const LOCAL_INSERT_ROWS_PER_STATEMENT = 500;
const MAX_REMOTE_INSERT_SQL_LENGTH = 100000;
const MAX_REMOTE_EXECUTION_SQL_LENGTH = 250000;
const MIN_REMOTE_INSERT_ROWS_PER_STATEMENT = 50;
const MAX_REMOTE_INSERT_ROWS_PER_STATEMENT = 2000;
const DEFAULT_REMOTE_TABLE_PARALLELISM = 4;

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)}s`;
};

const formatRowsPerSecond = (rows: number, durationMs: number): string => {
  if (rows <= 0 || durationMs <= 0) {
    return 'n/a';
  }

  const rate = rows / (durationMs / 1000);
  return `${rate >= 100 ? rate.toFixed(0) : rate.toFixed(2)} rows/s`;
};

const getRemoteBatchTuning = (connection: TargetConnection): RemoteBatchTuning => {
  if (connection.remoteBatchTuning !== undefined) {
    return connection.remoteBatchTuning;
  }

  connection.remoteBatchTuning = {
    rowsPerStatement: REMOTE_INSERT_ROWS_PER_STATEMENT,
    maxStatementSqlLength: MAX_REMOTE_INSERT_SQL_LENGTH,
    maxExecutionSqlLength: MAX_REMOTE_EXECUTION_SQL_LENGTH,
  };

  return connection.remoteBatchTuning;
};

const getInsertBatchSettings = (connection: TargetConnection): InsertBatchSettings => {
  if (connection.type === 'd1-remote') {
    const tuning = getRemoteBatchTuning(connection);
    return {
      rowsPerStatement: tuning.rowsPerStatement,
      maxStatementSqlLength: tuning.maxStatementSqlLength,
      maxExecutionSqlLength: tuning.maxExecutionSqlLength,
    };
  }

  return {
    rowsPerStatement: LOCAL_INSERT_ROWS_PER_STATEMENT,
    maxStatementSqlLength: Number.POSITIVE_INFINITY,
    maxExecutionSqlLength: Number.POSITIVE_INFINITY,
  };
};

const adjustRemoteBatchTuning = (
  connection: TargetConnection,
  executedRows: number,
  durationMs: number,
  sqlLength: number
): void => {
  if (connection.type !== 'd1-remote' || executedRows <= 0) {
    return;
  }

  const tuning = getRemoteBatchTuning(connection);
  const previousRowsPerStatement = tuning.rowsPerStatement;
  const nearSqlLimit = sqlLength >= Math.floor(tuning.maxExecutionSqlLength * 0.9);

  if (
    durationMs <= 1500 &&
    executedRows >= Math.floor(previousRowsPerStatement * 0.8) &&
    !nearSqlLimit
  ) {
    tuning.rowsPerStatement = Math.min(
      MAX_REMOTE_INSERT_ROWS_PER_STATEMENT,
      Math.max(previousRowsPerStatement + 25, Math.floor(previousRowsPerStatement * 1.25))
    );
  } else if (durationMs >= 6000 || nearSqlLimit) {
    tuning.rowsPerStatement = Math.max(
      MIN_REMOTE_INSERT_ROWS_PER_STATEMENT,
      Math.min(previousRowsPerStatement - 25, Math.floor(previousRowsPerStatement * 0.75))
    );
  }

  if (tuning.rowsPerStatement !== previousRowsPerStatement) {
    Logger.info(
      `[DataMigrator] Adaptive remote batching: rows_per_statement ${previousRowsPerStatement} -> ${tuning.rowsPerStatement} after ${executedRows} rows in ${formatDuration(durationMs)}`
    );
  }
};

const getTableDependencies = (table: TableInfo): string[] => {
  if (!Array.isArray(table.dependsOn)) {
    return [];
  }

  return [...new Set(table.dependsOn.filter((dependency) => dependency.trim() !== ''))];
};

const buildTableMigrationLevels = (tables: TableInfo[]): TableInfo[][] => {
  const tablesByName = new Map<string, TableInfo>();
  for (const table of tables) {
    tablesByName.set(table.name, table);
  }

  const unresolved = new Set<string>(tables.map((table) => table.name));
  const dependenciesByTable = new Map<string, Set<string>>();
  for (const table of tables) {
    dependenciesByTable.set(
      table.name,
      new Set(
        getTableDependencies(table).filter(
          (dependency) => dependency !== table.name && tablesByName.has(dependency)
        )
      )
    );
  }

  const levels: TableInfo[][] = [];
  while (unresolved.size > 0) {
    const readyNames = tables
      .map((table) => table.name)
      .filter((name) => unresolved.has(name) && (dependenciesByTable.get(name)?.size ?? 0) === 0);

    if (readyNames.length === 0) {
      const cyclicTables = tables.filter((table) => unresolved.has(table.name));
      if (cyclicTables.length > 0) {
        Logger.warn(
          `[DataMigrator] Table dependency cycle or unresolved reference detected. Falling back to sequential execution for: ${cyclicTables.map((table) => table.name).join(', ')}`
        );
        levels.push(...cyclicTables.map((table) => [table]));
      }
      break;
    }

    const levelTables = readyNames
      .map((name) => tablesByName.get(name))
      .filter((table): table is TableInfo => table !== undefined);
    levels.push(levelTables);

    for (const readyName of readyNames) {
      unresolved.delete(readyName);
    }

    for (const name of unresolved) {
      const dependencies = dependenciesByTable.get(name);
      for (const readyName of readyNames) {
        dependencies?.delete(readyName);
      }
    }
  }

  return levels;
};

const getTableParallelism = (
  config: MigrationConfig,
  targetConnection: TargetConnection
): number => {
  if (targetConnection.type !== 'd1-remote') {
    return 1;
  }

  if (config.sourceDriver === 'sqlite') {
    return 1;
  }

  return DEFAULT_REMOTE_TABLE_PARALLELISM;
};

const executeWithConcurrency = async <TInput, TResult>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TResult>
): Promise<TResult[]> => {
  if (items.length === 0) {
    return [];
  }

  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: TResult[] = new Array(items.length);
  let index = 0;

  const runWorker = async (): Promise<void> => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex] as TInput);
    }
  };

  await Promise.all(Array.from({ length: effectiveConcurrency }, () => runWorker()));
  return results;
};

const estimateRemoteRowSqlLength = (keys: string[], row: Record<string, unknown>): number => {
  const delimitersLength = keys.length > 0 ? (keys.length - 1) * 2 : 0;
  const valuesLength = keys.reduce((total, key) => {
    return total + toSqlLiteral(row[key]).length;
  }, 0);

  return valuesLength + delimitersLength + 2;
};

const createInsertStatements = (
  targetType: TargetConnection['type'],
  settings: InsertBatchSettings,
  tableName: string,
  data: Record<string, unknown>[]
): InsertStatement[] => {
  if (data.length === 0) {
    return [];
  }

  const keys = Object.keys(data[0]);
  const columnList = keys.map((key) => `\`${key}\``).join(', ');
  const rowPlaceholder = `(${keys.map(() => '?').join(', ')})`;
  const prefix = `INSERT INTO \`${tableName}\` (${columnList}) VALUES `;
  const rowLimit = settings.rowsPerStatement;
  const maxSqlLength = settings.maxStatementSqlLength;

  const statements: InsertStatement[] = [];
  let batchRows: Record<string, unknown>[] = [];
  let batchParameters: unknown[] = [];
  let batchSqlLength = prefix.length;

  const flushBatch = (): void => {
    if (batchRows.length === 0) {
      return;
    }

    statements.push({
      sql: `${prefix}${batchRows.map(() => rowPlaceholder).join(', ')}`,
      parameters: batchParameters,
      rowCount: batchRows.length,
    });

    batchRows = [];
    batchParameters = [];
    batchSqlLength = prefix.length;
  };

  for (const row of data) {
    const rowParameters = keys.map((key) => row[key]);
    const rowSqlLength =
      targetType === 'd1-remote' ? estimateRemoteRowSqlLength(keys, row) : rowPlaceholder.length;
    const separatorLength = batchRows.length > 0 ? 2 : 0;
    const nextSqlLength = batchSqlLength + separatorLength + rowSqlLength;

    if (batchRows.length > 0 && (batchRows.length >= rowLimit || nextSqlLength > maxSqlLength)) {
      flushBatch();
    }

    batchRows.push(row);
    batchParameters.push(...rowParameters);
    batchSqlLength += (batchRows.length > 1 ? 2 : 0) + rowSqlLength;
  }

  flushBatch();
  return statements;
};

const createRemoteExecutionBatchesWithLimit = (
  statements: InsertStatement[],
  maxExecutionSqlLength: number
): InsertStatement[] => {
  if (statements.length <= 1) {
    return statements;
  }

  const batches: InsertStatement[] = [];
  let sqlParts: string[] = [];
  let parameters: unknown[] = [];
  let rowCount = 0;
  let currentLength = 0;

  const flushBatch = (): void => {
    if (sqlParts.length === 0) {
      return;
    }

    batches.push({
      sql: sqlParts.join(';\n'),
      parameters,
      rowCount,
    });

    sqlParts = [];
    parameters = [];
    rowCount = 0;
    currentLength = 0;
  };

  for (const statement of statements) {
    const separatorLength = sqlParts.length > 0 ? 2 : 0;
    const nextLength = currentLength + separatorLength + statement.sql.length;

    if (sqlParts.length > 0 && nextLength > maxExecutionSqlLength) {
      flushBatch();
    }

    sqlParts.push(statement.sql);
    parameters.push(...statement.parameters);
    rowCount += statement.rowCount;
    currentLength += (sqlParts.length > 1 ? 2 : 0) + statement.sql.length;
  }

  flushBatch();
  return batches;
};

const createRemoteD1Adapter = (database: string): DatabaseAdapter => {
  return {
    async connect(): Promise<void> {
      await Promise.resolve();
    },
    async disconnect(): Promise<void> {
      await Promise.resolve();
    },
    async query(sql: string, parameters: unknown[]): Promise<AdapterQueryResult> {
      const renderedSql = bindSqlParameters(sql, parameters);
      const output = WranglerD1.executeSql({ dbName: database, isLocal: false, sql: renderedSql });
      const payload = extractWranglerJson(output);

      if (payload === null || payload.length === 0) {
        const rows = parseWranglerTableRows(output);
        return { rows, rowCount: rows.length };
      }

      const last = payload.at(-1);
      if (last === undefined) {
        return { rows: [], rowCount: 0 };
      }
      const rows = Array.isArray(last.results) ? last.results : [];
      const totalChanges = payload.reduce((count, statement) => {
        return count + (typeof statement.meta?.changes === 'number' ? statement.meta.changes : 0);
      }, 0);
      const rowCount = totalChanges > 0 ? totalChanges : rows.length;
      return { rows, rowCount };
    },
  };
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

  return [...new Set(messages)];
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

const normalizeNullLikeValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase() === 'null' ? null : value;
};

const parseConnectionDetails = (
  connectionString: string,
  defaultPort: number,
  defaultDatabase: string,
  defaultUsername: string
): ConnectionDetails => {
  try {
    const parsed = new URL(connectionString);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort,
      database: databaseName || defaultDatabase,
      username: parsed.username ? decodeURIComponent(parsed.username) : defaultUsername,
      password: parsed.password ? decodeURIComponent(parsed.password) : '',
    };
  } catch (error) {
    throw ErrorFactory.createValidationError('Invalid source connection string format', error);
  }
};

const parseSqliteDatabasePath = (connectionString: string): string => {
  const trimmed = connectionString.trim();
  if (trimmed.length === 0) {
    return ':memory:';
  }

  if (!trimmed.includes('://')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'sqlite:') {
      return trimmed;
    }

    const pathName = decodeURIComponent(parsed.pathname);
    return pathName.length > 0 ? pathName : ':memory:';
  } catch {
    return trimmed;
  }
};

const createSourceAdapter = (config: MigrationConfig): DatabaseAdapter => {
  switch (config.sourceDriver) {
    case 'mysql': {
      const connectionDetails = parseConnectionDetails(
        config.sourceConnection,
        3306,
        'mysql',
        'root'
      );
      return MySQLAdapter.create({
        driver: 'mysql',
        host: connectionDetails.host,
        port: connectionDetails.port,
        database: connectionDetails.database,
        username: connectionDetails.username,
        password: connectionDetails.password,
        ssl: config.sourceSsl,
      });
    }
    case 'postgresql': {
      const connectionDetails = parseConnectionDetails(
        config.sourceConnection,
        5432,
        'postgres',
        'postgres'
      );
      return PostgreSQLAdapter.create({
        driver: 'postgresql',
        host: connectionDetails.host,
        port: connectionDetails.port,
        database: connectionDetails.database,
        username: connectionDetails.username,
        password: connectionDetails.password,
      });
    }
    case 'sqlite':
      return SQLiteAdapter.create({
        driver: 'sqlite',
        database: parseSqliteDatabasePath(config.sourceConnection),
      });
    case 'sqlserver': {
      const connectionDetails = parseConnectionDetails(
        config.sourceConnection,
        1433,
        'master',
        'sa'
      );
      return SQLServerAdapter.create({
        driver: 'sqlserver',
        host: connectionDetails.host,
        port: connectionDetails.port,
        database: connectionDetails.database,
        username: connectionDetails.username,
        password: connectionDetails.password,
      });
    }
    default:
      throw ErrorFactory.createValidationError(`Unsupported driver: ${config.sourceDriver}`);
  }
};

const safelyDisconnect = async (
  label: 'source' | 'target',
  connection: SourceConnection | TargetConnection | null
): Promise<void> => {
  try {
    await connection?.adapter?.disconnect?.();
  } catch (error) {
    Logger.warn(`Failed to close ${label} adapter: ${error}`);
  }
};

/**
 * DataMigrator - Sealed namespace for data migration
 * Provides chunked data migration with progress tracking
 */
export const DataMigrator = Object.freeze({
  /**
   * Migrate data from source to target
   */
  async migrateData(config: MigrationConfig): Promise<MigrationProgress> {
    Logger.info('Starting data migration...');

    let sourceConnection: SourceConnection | null = null;
    let targetConnection: TargetConnection | null = null;

    try {
      // Initialize progress tracking
      const progress: MigrationProgress = {
        migrationId: config.migrationId || 'unknown',
        startTime: new Date(),
        currentTable: '',
        table: '',
        totalTables: 0,
        processedRows: 0,
        totalRows: 0,
        percentage: 0,
        errors: {},
        status: 'processing',
      };

      // Connect to source database
      Logger.info('Connecting to source database...');
      sourceConnection = await DataMigrator.connectToSource(config);

      // Connect to target D1 database
      Logger.info('Connecting to target D1 database...');
      targetConnection = await DataMigrator.connectToTarget(config);

      // Get schema information
      const schema = await DataMigrator.getSchemaInfo(sourceConnection);
      progress.totalTables = schema.tables.length;

      // Calculate total rows for progress tracking
      progress.totalRows = schema.tables.reduce((total, table) => total + (table.rowCount || 0), 0);

      Logger.info(`Migrating ${progress.totalTables} tables with ${progress.totalRows} total rows`);

      if (targetConnection.adapter) {
        await DataMigrator.prepareTargetSchema(sourceConnection, targetConnection, config);
      }

      Logger.info('Starting table migration...');
      const tableLevels = buildTableMigrationLevels(schema.tables);
      const tableParallelism = getTableParallelism(config, targetConnection);

      for (const [levelIndex, tables] of tableLevels.entries()) {
        Logger.info(
          `[DataMigrator] Starting table level ${levelIndex + 1}/${tableLevels.length}: ${tables.map((table) => table.name).join(', ')}`
        );

        const levelResults = await executeWithConcurrency(
          tables,
          tableParallelism,
          async (table) => {
            return DataMigrator.migrateTable(
              table,
              sourceConnection as SourceConnection,
              targetConnection as TargetConnection,
              config
            );
          }
        );

        for (const [resultIndex, result] of levelResults.entries()) {
          const table = tables[resultIndex];
          progress.processedRows += result.rowsMigrated;

          if (result.errors.length > 0 && table !== undefined) {
            progress.errors[table.name] = result.errors.join('; ');
          }
        }
      }

      progress.totalRows = Math.max(progress.totalRows, progress.processedRows);

      // Update final percentage
      progress.percentage =
        progress.totalRows > 0
          ? Math.round((progress.processedRows / progress.totalRows) * 100)
          : 0;

      progress.status = Object.keys(progress.errors).length > 0 ? 'failed' : 'completed';
      Logger.info(
        `Migration completed: ${progress.processedRows}/${progress.totalRows} rows migrated`
      );

      return progress;
    } catch (error) {
      const errorChain = getErrorChainMessages(error);
      Logger.error(`Data migration failed: ${errorChain.join(' -> ')}`);
      logDetailedError('Data migration failure', error);
      Logger.error('Data migration failure details:', error);
      throw error;
    } finally {
      await safelyDisconnect('source', sourceConnection);
      await safelyDisconnect('target', targetConnection);
    }
  },

  /**
   * Connect to source database
   */
  async connectToSource(config: MigrationConfig): Promise<SourceConnection> {
    Logger.info(`Connecting to ${config.sourceDriver} database...`);

    const adapter = createSourceAdapter(config);

    try {
      await adapter.connect();
    } catch (error) {
      const errorChain = getErrorChainMessages(error);
      Logger.error(`Source database connection failed: ${errorChain.join(' -> ')}`);
      logDetailedError('Source database connection failure', error);
      Logger.error('Source database connection failure details:', error);
      throw error;
    }

    const sourceConnection: SourceConnection = {
      driver: config.sourceDriver,
      connectionString: config.sourceConnection,
      sourceConnectionOrigin: config.sourceConnectionOrigin,
      sourceSsl: config.sourceSsl,
      connected: true,
      adapter,
    };

    Logger.info('✓ Source database connected');
    return sourceConnection;
  },

  /**
   * Connect to target D1 database
   */
  async connectToTarget(config: MigrationConfig): Promise<TargetConnection> {
    Logger.info(`Connecting to target D1 database: ${config.targetDatabase}`);

    const connection: TargetConnection = {
      type: config.targetType,
      database: config.targetDatabase,
      connected: true,
    };

    if (config.targetType === 'd1') {
      const projectRoot = process.cwd();
      const resolvedTarget = LocalD1Resolver.resolveD1Binding(projectRoot, config.targetDatabase);
      const d1LocalPath = await LocalD1Resolver.resolveLocalD1SqlitePath(
        projectRoot,
        config.targetDatabase
      );
      const bindingName = resolvedTarget.config.binding?.trim();
      const configuredDatabaseName = resolvedTarget.config.database_name?.trim();

      Logger.info(
        `[DataMigrator] Using resolved local D1 target (${resolvedTarget.matchedBy}): database_name=${configuredDatabaseName || 'n/a'}, binding=${bindingName || 'n/a'}`
      );
      Logger.info(`[DataMigrator] Using resolved local D1 SQLite path: ${d1LocalPath}`);

      const d1Local = SQLiteAdapter.create({ driver: 'sqlite', database: d1LocalPath });

      try {
        await d1Local.connect();
        connection.adapter = d1Local;
        connection.database = resolvedTarget.databaseName;
      } catch (error) {
        throw ErrorFactory.createConnectionError(
          `Unable to connect resolved local D1 path ${d1LocalPath}: ${String(error)}`
        );
      }
    } else {
      Logger.info(`[DataMigrator] Using Wrangler remote D1 target: ${config.targetDatabase}`);
      connection.adapter = createRemoteD1Adapter(config.targetDatabase);
      await connection.adapter.connect();
    }

    Logger.info('✓ Target D1 database connected');
    return connection;
  },

  /**
   * Prepare target schema using source structure
   */
  async prepareTargetSchema(
    sourceConnection: SourceConnection,
    targetConnection: TargetConnection,
    config: MigrationConfig
  ): Promise<void> {
    if (!targetConnection.adapter) {
      throw ErrorFactory.createConnectionError(
        'No target adapter available for D1 schema preparation'
      );
    }

    Logger.info('Preparing target D1 schema...');
    const sourceSchema = await SchemaAnalyzer.analyzeSchema({
      driver: sourceConnection.driver,
      connectionString: sourceConnection.connectionString,
      sourceConnectionOrigin: sourceConnection.sourceConnectionOrigin,
      sourceSsl: sourceConnection.sourceSsl,
    });

    const d1Schema = SchemaBuilder.buildD1Schema(sourceSchema.tables, config.sourceDriver);
    SchemaBuilder.assertValidSchema(d1Schema);

    for (const table of d1Schema) {
      const createSQL = SchemaBuilder.generateCreateTableSQL(table).replace(
        /^CREATE TABLE\s+/i,
        'CREATE TABLE IF NOT EXISTS '
      );
      await targetConnection.adapter.query(createSQL, []);

      const indexSQL = SchemaBuilder.generateIndexSQL(table).map((sql) =>
        sql
          .replace(/^CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
          .replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ')
      );

      for (const sql of indexSQL) {
        await targetConnection.adapter.query(sql, []);
      }
    }

    Logger.info(`✓ Target schema prepared for ${d1Schema.length} tables`);
  },

  /**
   * Get schema information from source database
   */
  async getSchemaInfo(_connection: SourceConnection): Promise<{ tables: TableInfo[] }> {
    Logger.info('Retrieving schema information...');

    const sourceSchema = await SchemaAnalyzer.analyzeSchema({
      driver: _connection.driver,
      connectionString: _connection.connectionString,
      sourceConnectionOrigin: _connection.sourceConnectionOrigin,
      sourceSsl: _connection.sourceSsl,
    });

    const tables = sourceSchema.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount || 0,
      dependsOn: table.foreignKeys.map((foreignKey) => foreignKey.referencedTable),
    }));

    Logger.info(`Found ${tables.length} tables`);
    return { tables };
  },

  /**
   * Get target table row count for resumability
   */
  async getTargetRowCount(targetConnection: TargetConnection, tableName: string): Promise<number> {
    if (!targetConnection.adapter) return 0;

    try {
      const result = await targetConnection.adapter.query(
        `SELECT COUNT(*) as count FROM \`${tableName}\``,
        []
      );
      const count = result.rows[0]?.['count'] as number | undefined;
      return typeof count === 'number' ? count : 0;
    } catch {
      // Table might not exist or query failed
      return 0;
    }
  },

  /**
   * Migrate single table
   */
  async migrateTable(
    table: TableInfo,
    sourceConnection: SourceConnection,
    targetConnection: TargetConnection,
    config: MigrationConfig
  ): Promise<{ rowsMigrated: number; errors: string[] }> {
    Logger.info(`Migrating table: ${table.name}`);

    const errors: string[] = [];
    let rowsMigrated = 0;
    const tableStartTime = Date.now();

    try {
      const totalRows = table.rowCount || 0;
      const batchSize = config.batchSize || 1000;

      const targetRowCount = await DataMigrator.getTargetRowCount(targetConnection, table.name);
      if (targetRowCount >= totalRows) {
        Logger.info(
          `Table ${table.name} already synced: ${targetRowCount}/${totalRows} rows, skipping`
        );
        return { rowsMigrated: 0, errors: [] };
      }

      if (targetRowCount > 0) {
        Logger.info(
          `Table ${table.name} partially synced: ${targetRowCount}/${totalRows} rows, resuming from offset ${targetRowCount}`
        );
      } else {
        Logger.info(`Processing ${totalRows} rows in batches of ${batchSize}`);
      }

      rowsMigrated = await DataMigrator.processTableChunks(
        table,
        sourceConnection,
        targetConnection,
        totalRows,
        batchSize,
        targetRowCount,
        errors
      );

      const tableDurationMs = Date.now() - tableStartTime;
      Logger.info(
        `[DataMigrator] Table ${table.name} completed rows=${rowsMigrated}/${totalRows} duration=${formatDuration(tableDurationMs)} rate=${formatRowsPerSecond(rowsMigrated, tableDurationMs)}`
      );

      return { rowsMigrated, errors };
    } catch (error) {
      const errorMsg = `Table migration failed for ${table.name}: ${error}`;
      Logger.error(errorMsg);
      errors.push(errorMsg);
      return { rowsMigrated, errors };
    }
  },

  async processTableChunks(
    table: TableInfo,
    sourceConnection: SourceConnection,
    targetConnection: TargetConnection,
    totalRows: number,
    batchSize: number,
    startOffset: number,
    errors: string[]
  ): Promise<number> {
    let rowsMigrated = 0;

    for (let offset = startOffset; offset < totalRows; offset += batchSize) {
      try {
        const chunkStartTime = Date.now();
        const chunk = await DataMigrator.readDataChunk(
          sourceConnection,
          table.name,
          offset,
          batchSize
        );

        if (chunk.length === 0) {
          break;
        }

        const transformedChunk = await DataMigrator.transformData(chunk, table.name);
        const insertedRows = await DataMigrator.insertData(
          targetConnection,
          table.name,
          transformedChunk
        );

        if (insertedRows !== chunk.length) {
          const verificationError = DataMigrator.createChunkVerificationError(
            table.name,
            offset,
            chunk.length,
            insertedRows
          );
          throw ErrorFactory.createValidationError(
            `Chunk insert mismatch on ${table.name}`,
            verificationError
          );
        }

        rowsMigrated += insertedRows;

        const chunkDurationMs = Date.now() - chunkStartTime;
        Logger.info(
          `[DataMigrator] Chunk ${table.name} offset=${offset} rows=${insertedRows} duration=${formatDuration(chunkDurationMs)} rate=${formatRowsPerSecond(insertedRows, chunkDurationMs)}`
        );

        if (totalRows > 10000 && rowsMigrated % (batchSize * 10) === 0) {
          const normalizedTotalRows = Math.max(totalRows, rowsMigrated);
          const percentage = Math.round((rowsMigrated / normalizedTotalRows) * 100);
          Logger.info(
            `Table ${table.name}: ${rowsMigrated}/${normalizedTotalRows} (${percentage}%)`
          );
        }
      } catch (error) {
        const errorMsg = `Chunk processing failed at offset ${offset}: ${error}`;
        Logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return rowsMigrated;
  },

  /**
   * Read data chunk from source database
   */
  async readDataChunk(
    sourceConnection: SourceConnection,
    tableName: string,
    offset: number,
    batchSize: number
  ): Promise<Record<string, unknown>[]> {
    if (!sourceConnection.adapter) return [];

    try {
      const selectSql = DataMigrator.buildSelectChunkSQL(sourceConnection.driver, tableName);
      const result = await sourceConnection.adapter.query(
        `${selectSql} LIMIT ${batchSize} OFFSET ${offset}`,
        []
      );
      return result.rows || [];
    } catch (error) {
      Logger.error(`Chunk read failed ${error}`);
      return [];
    }
  },

  /**
   * Transform data for D1 compatibility
   */
  async transformData(
    chunk: Record<string, unknown>[],
    _tableName: string
  ): Promise<Record<string, unknown>[]> {
    return chunk.map((row) => {
      const transformed: Record<string, unknown> = {};

      for (const [key, rawValue] of Object.entries(row)) {
        const value = normalizeNullLikeValue(rawValue);

        if (value === undefined) {
          transformed[key] = null;
          continue;
        }

        if (value instanceof Date) {
          transformed[key] = value.toISOString();
          continue;
        }

        if (typeof value === 'bigint') {
          transformed[key] = value.toString();
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          const globalBuffer = globalThis as unknown as {
            Buffer?: { isBuffer(input: unknown): boolean };
          };
          if (globalBuffer.Buffer?.isBuffer(value) === true || value instanceof Uint8Array) {
            transformed[key] = value;
            continue;
          }

          transformed[key] = JSON.stringify(value);
          continue;
        }

        transformed[key] = value;
      }

      return transformed;
    });
  },

  /**
   * Insert data into target database
   */
  async insertData(
    targetConnection: TargetConnection,
    tableName: string,
    data: Record<string, unknown>[]
  ): Promise<number> {
    if (data.length === 0) return 0;

    if (!targetConnection.adapter) {
      throw ErrorFactory.createValidationError(
        `No target adapter configured for ${targetConnection.database}`
      );
    }

    const batchSettings = getInsertBatchSettings(targetConnection);
    const statements = createInsertStatements(
      targetConnection.type,
      batchSettings,
      tableName,
      data
    );
    const executableStatements =
      targetConnection.type === 'd1-remote'
        ? createRemoteExecutionBatchesWithLimit(statements, batchSettings.maxExecutionSqlLength)
        : statements;

    let insertedRows = 0;
    for (const statement of executableStatements) {
      try {
        const executionStartTime = Date.now();
        const result = await targetConnection.adapter.query(statement.sql, statement.parameters);
        const executionDurationMs = Date.now() - executionStartTime;
        const affectedRows =
          typeof result.rowCount === 'number' ? result.rowCount : statement.rowCount;
        insertedRows += affectedRows;

        adjustRemoteBatchTuning(
          targetConnection,
          affectedRows,
          executionDurationMs,
          statement.sql.length
        );
      } catch (error) {
        throw ErrorFactory.createValidationError(`Insert failed for table ${tableName}`, {
          sql: statement.sql,
          rowCount: statement.rowCount,
          cause: error,
        });
      }
    }

    return insertedRows;
  },

  /**
   * Build chunked SELECT SQL by source driver
   */
  buildSelectChunkSQL(driver: MigrationConfig['sourceDriver'], tableName: string): string {
    switch (driver) {
      case 'postgresql':
        return `SELECT * FROM "${tableName}"`;
      case 'sqlserver':
        return `SELECT * FROM [${tableName}]`;
      case 'sqlite':
      case 'mysql':
      default:
        return `SELECT * FROM \`${tableName}\``;
    }
  },

  /**
   * Build chunk verification error object
   */
  createChunkVerificationError(
    table: string,
    offset: number,
    expectedRows: number,
    insertedRows: number
  ): MigrationVerificationError {
    return {
      table,
      offset,
      expectedRows,
      insertedRows,
    };
  },

  /**
   * Create migration progress tracker
   */
  createProgress(migrationId: string): MigrationProgress {
    return {
      migrationId,
      startTime: new Date(),
      currentTable: '',
      table: '',
      totalTables: 0,
      totalRows: 0,
      processedRows: 0,
      percentage: 0,
      errors: {},
      status: 'pending',
    };
  },

  /**
   * Update migration progress
   */
  updateProgress(
    progress: MigrationProgress,
    updates: Partial<MigrationProgress>
  ): MigrationProgress {
    return { ...progress, ...updates };
  },
});
