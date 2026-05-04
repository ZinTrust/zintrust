/* eslint-disable no-await-in-loop */
/**
 * Data Migrator
 * Handles the actual data migration between databases
 */

import { ErrorFactory, LocalD1Resolver, Logger } from '@zintrust/core';

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
  connected: boolean;
  adapter?: DatabaseAdapter;
}

export interface TargetConnection {
  type: 'd1' | 'd1-remote';
  database: string;
  connected: boolean;
  adapter?: DatabaseAdapter;
}

export interface TableInfo {
  name: string;
  rowCount?: number;
}

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

      // Migrate each table sequentially for reliable D1/SQLite writes
      Logger.info('Starting table migration...');
      for (const table of schema.tables) {
        const result = await DataMigrator.migrateTable(
          table,
          sourceConnection,
          targetConnection,
          config
        );

        progress.processedRows += result.rowsMigrated;

        // Add any errors to progress
        if (result.errors.length > 0) {
          progress.errors[table.name] = result.errors.join('; ');
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
      Logger.error('Data migration failed:', error);
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
    Logger.info(`Connecting to ${config.sourceDriver} database: ${config.sourceConnection}`);

    let adapter: DatabaseAdapter;
    switch (config.sourceDriver) {
      case 'mysql':
        adapter = MySQLAdapter.create({
          driver: 'mysql',
          connectionString: config.sourceConnection,
        });
        break;
      case 'postgresql': {
        const connectionDetails = parseConnectionDetails(
          config.sourceConnection,
          5432,
          'postgres',
          'postgres'
        );
        adapter = PostgreSQLAdapter.create({
          driver: 'postgresql',
          host: connectionDetails.host,
          port: connectionDetails.port,
          database: connectionDetails.database,
          username: connectionDetails.username,
          password: connectionDetails.password,
        });
        break;
      }
      case 'sqlite':
        adapter = SQLiteAdapter.create({
          driver: 'sqlite',
          database: parseSqliteDatabasePath(config.sourceConnection),
        });
        break;
      case 'sqlserver': {
        const connectionDetails = parseConnectionDetails(
          config.sourceConnection,
          1433,
          'master',
          'sa'
        );
        adapter = SQLServerAdapter.create({
          driver: 'sqlserver',
          host: connectionDetails.host,
          port: connectionDetails.port,
          database: connectionDetails.database,
          username: connectionDetails.username,
          password: connectionDetails.password,
        });
        break;
      }
      default:
        throw ErrorFactory.createValidationError(`Unsupported driver: ${config.sourceDriver}`);
    }

    await adapter.connect();

    const connection: SourceConnection = {
      driver: config.sourceDriver,
      connectionString: config.sourceConnection || '',
      connected: true,
      adapter,
    };

    Logger.info('✓ Source database connected');
    return connection;
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
    });

    const tables = sourceSchema.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount || 0,
    }));

    Logger.info(`Found ${tables.length} tables`);
    return { tables };
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

    try {
      const totalRows = table.rowCount || 0;
      const batchSize = config.batchSize || 1000;

      Logger.info(`Processing ${totalRows} rows in batches of ${batchSize}`);

      // Process data in chunks sequentially for data integrity
      for (let offset = 0; offset < totalRows; offset += batchSize) {
        try {
          const chunk = await DataMigrator.readDataChunk(
            sourceConnection,
            table.name,
            offset,
            batchSize
          );

          if (chunk.length === 0) break;

          // Transform data for D1 compatibility
          const transformedChunk = await DataMigrator.transformData(chunk, table.name);

          // Insert data into target
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

          // Log progress for large tables
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
          // Continue with next chunk instead of failing completely
          continue;
        }
      }

      Logger.info(`Table ${table.name} completed: ${rowsMigrated} rows migrated`);
    } catch (error) {
      const errorMsg = `Failed to migrate table ${table.name}: ${error}`;
      Logger.error(errorMsg);
      errors.push(errorMsg);
    }

    return { rowsMigrated, errors };
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
    Logger.debug(`Reading chunk from ${tableName}: offset ${offset}, size ${batchSize}`);

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
    tableName: string
  ): Promise<Record<string, unknown>[]> {
    Logger.debug(`Transforming ${chunk.length} rows for table ${tableName}`);

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
    Logger.debug(`Inserting ${data.length} rows into ${tableName}`);

    if (data.length === 0) return 0;

    if (!targetConnection.adapter) {
      throw ErrorFactory.createValidationError(
        `No target adapter configured for ${targetConnection.database}`
      );
    }

    const keys = Object.keys(data[0]);
    const columnList = keys.map((key) => `\`${key}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${tableName}\` (${columnList}) VALUES (${placeholders})`;

    let insertedRows = 0;
    for (const row of data) {
      const values = keys.map((key) => row[key]);
      try {
        await targetConnection.adapter.query(sql, values);
        insertedRows += 1;
      } catch (error) {
        throw ErrorFactory.createValidationError(`Insert failed for table ${tableName}`, {
          sql,
          row,
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
