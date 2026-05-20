/**
 * Schema Analyzer
 * Analyzes database schemas for migration compatibility
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import { MySQLAdapter } from '@zintrust/db-mysql';
import { PostgreSQLAdapter } from '@zintrust/db-postgres';
import { SQLiteAdapter } from '@zintrust/db-sqlite';
import { SQLServerAdapter } from '@zintrust/db-sqlserver';
import type {
  ColumnSchema,
  DatabaseSchema,
  ForeignKeySchema,
  IndexSchema,
  SourceConnectionOrigin,
  TableConstraint,
  TableRelationship,
  TableSchema,
} from '../types';

type ConnectionDetails = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
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

const redactConnectionString = (connectionString: string): string => {
  try {
    const parsed = new URL(connectionString);
    if (parsed.password.trim() !== '') {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return connectionString;
  }
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
    stack?: unknown;
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

// Type definitions for adapters
export interface IDatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(
    sql: string,
    parameters: unknown[]
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
  queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;
  ping(): Promise<void>;
  transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T>;
  rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]>;
  ensureMigrationsTable?(): Promise<void>;
  getType(): string;
  isConnected(): boolean;
  getPlaceholder(index: number): string;
}

/**
 * SchemaAnalyzer - Sealed namespace for schema analysis
 * Provides database schema analysis and compatibility checking
 */
export const SchemaAnalyzer = Object.freeze({
  /**
   * Analyze source database schema
   */
  async analyzeSchema(connection: {
    driver: string;
    connectionString: string;
    sourceConnectionOrigin?: SourceConnectionOrigin;
    sourceSsl?: boolean;
  }): Promise<DatabaseSchema> {
    Logger.info('Analyzing database schema...');

    try {
      // Connect to source database based on driver type
      const tables = await SchemaAnalyzer.extractTables(connection);
      const relationships = await SchemaAnalyzer.extractRelationships(connection, tables);
      const constraints = await SchemaAnalyzer.extractConstraints(connection, tables);

      const schema: DatabaseSchema = {
        tables,
        relationships,
        constraints,
      };

      Logger.info(
        `Found ${schema.tables.length} tables, ${schema.relationships.length} relationships`
      );
      return schema;
    } catch (error) {
      const errorChain = getErrorChainMessages(error);
      Logger.error(`Schema analysis failure chain: ${errorChain.join(' -> ')}`);
      logDetailedError('Schema analysis failure', error);
      Logger.error('Failed to analyze database schema:', error);
      throw error;
    }
  },

  /**
   * Extract tables from source database
   */
  async extractTables(connection: {
    driver: string;
    connectionString: string;
    sourceConnectionOrigin?: SourceConnectionOrigin;
    sourceSsl?: boolean;
  }): Promise<TableSchema[]> {
    Logger.info(`Extracting tables from ${connection.driver} database...`);
    Logger.info(
      `[SchemaAnalyzer] Source connection (redacted): ${redactConnectionString(connection.connectionString)}`
    );
    Logger.info(`[SchemaAnalyzer] Source SSL enabled: ${connection.sourceSsl === true}`);

    try {
      // Create appropriate adapter based on driver
      let adapter: IDatabaseAdapter;
      switch (connection.driver) {
        case 'mysql': {
          const connectionDetails = parseConnectionDetails(
            connection.connectionString,
            3306,
            'mysql',
            'root'
          );
          adapter = MySQLAdapter.create({
            driver: connection.driver,
            host: connectionDetails.host,
            port: connectionDetails.port,
            database: connectionDetails.database,
            username: connectionDetails.username,
            password: connectionDetails.password,
            ssl: connection.sourceSsl,
          });
          break;
        }
        case 'postgresql':
          adapter = PostgreSQLAdapter.create({
            driver: connection.driver,
          });
          break;
        case 'sqlite':
          adapter = SQLiteAdapter.create({
            driver: connection.driver,
          });
          break;
        case 'sqlserver':
          adapter = SQLServerAdapter.create({
            driver: connection.driver,
          });
          break;
        default:
          throw ErrorFactory.createValidationError(
            `Unsupported database driver: ${connection.driver}`
          );
      }

      // Connect to database
      await adapter.connect();

      // Get table list based on database type
      const tables = await SchemaAnalyzer.getTableList(adapter, connection.driver);

      // Extract detailed schema for each table in parallel for better performance
      const tableSchemas = await Promise.all(
        tables.map((tableName) =>
          SchemaAnalyzer.getTableSchema(adapter, tableName, connection.driver)
        )
      );

      await adapter.disconnect();
      Logger.info(`Extracted ${tableSchemas.length} tables`);
      return tableSchemas;
    } catch (error) {
      const errorChain = getErrorChainMessages(error);
      Logger.error(`Failed to extract database tables: ${errorChain.join(' -> ')}`);
      logDetailedError('Schema extraction failure', error);
      Logger.error('Schema extraction failure details:', error);
      throw ErrorFactory.createTryCatchError(
        `Schema extraction failed: ${errorChain[0] ?? getErrorMessage(error)}`,
        error
      );
    }
  },

  /**
   * Extract relationships from source database
   */
  async extractRelationships(
    _connection: { driver: string; connectionString: string },
    _tables: TableSchema[]
  ): Promise<TableRelationship[]> {
    Logger.info('Extracting table relationships...');

    const relationships: TableRelationship[] = [];
    for (const table of _tables) {
      for (const foreignKey of table.foreignKeys ?? []) {
        relationships.push({
          sourceTable: table.name,
          sourceColumn: foreignKey.column,
          targetTable: foreignKey.referencedTable,
          targetColumn: foreignKey.referencedColumn,
          type: 'one-to-many',
        });
      }
    }

    Logger.info(`Extracted ${relationships.length} relationships`);
    return relationships;
  },

  /**
   * Extract constraints from source database
   */
  async extractConstraints(
    _connection: { driver: string; connectionString: string },
    _tables: TableSchema[]
  ): Promise<TableConstraint[]> {
    Logger.info('Extracting table constraints...');

    const constraints: TableConstraint[] = [];

    for (const table of _tables) {
      if (table.primaryKeys.length > 0) {
        constraints.push({
          table: table.name,
          type: 'primary_key',
          columns: [...table.primaryKeys],
          definition: `PRIMARY KEY (${table.primaryKeys.join(', ')})`,
        });
      }

      for (const index of table.indexes ?? []) {
        if (index.unique) {
          constraints.push({
            table: table.name,
            type: 'unique',
            columns: [...index.columns],
            definition: `UNIQUE (${index.columns.join(', ')})`,
          });
        }
      }

      for (const foreignKey of table.foreignKeys ?? []) {
        constraints.push({
          table: table.name,
          type: 'foreign_key',
          columns: [foreignKey.column],
          definition: `FOREIGN KEY (${foreignKey.column}) REFERENCES ${foreignKey.referencedTable}(${foreignKey.referencedColumn})`,
        });
      }
    }

    Logger.info(`Extracted ${constraints.length} constraints`);
    return constraints;
  },

  /**
   * Check schema compatibility with D1
   */
  checkD1Compatibility(schema: DatabaseSchema): {
    compatible: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for unsupported features
    schema.tables.forEach((table: TableSchema) => {
      // Check for unsupported column types
      table.columns.forEach((column: ColumnSchema) => {
        if (!SchemaAnalyzer.isSupportedType(column.type)) {
          issues.push(`Unsupported column type: ${column.type} in table ${table.name}`);
        }
      });

      // Check for reserved keywords
      if (!SchemaAnalyzer.isValidTableName(table.name)) {
        issues.push(`Invalid table name: ${table.name}`);
      }
    });

    return {
      compatible: issues.length === 0,
      issues,
      warnings,
    };
  },

  /**
   * Check if column type is supported by D1
   */
  isSupportedType(type: string): boolean {
    const supportedTypes = [
      'integer',
      'text',
      'real',
      'numeric',
      'blob',
      'varchar',
      'char',
      'date',
      'datetime',
      'boolean',
    ];

    return supportedTypes.includes(type.toLowerCase());
  },

  /**
   * Check if table name is valid for D1
   */
  isValidTableName(name: string): boolean {
    // Check for SQLite/D1 reserved keywords
    const reserved = [
      'select',
      'insert',
      'update',
      'delete',
      'create',
      'drop',
      'alter',
      'index',
      'table',
      'database',
      'primary',
      'foreign',
      'key',
      'constraint',
      'unique',
      'not',
      'null',
      'default',
    ];

    const normalizedName = name.toLowerCase();
    return !reserved.includes(normalizedName) && /^\w*$/.test(name);
  },

  /**
   * Generate schema analysis report
   */
  generateReport(schema: DatabaseSchema): string {
    let report = '# Database Schema Analysis Report\n\n';
    report += `## Summary\n`;
    report += `- Tables: ${schema.tables.length}\n`;
    report += `- Relationships: ${schema.relationships.length}\n`;
    report += `- Constraints: ${schema.constraints.length}\n\n`;

    report += `## Tables\n\n`;
    schema.tables.forEach((table) => {
      report += `### ${table.name}\n`;
      report += `- Columns: ${table.columns.length}\n`;
      report += `- Primary Key: ${table.primaryKey || 'None'}\n\n`;

      report += `#### Columns\n`;
      table.columns.forEach((column) => {
        report += `- ${column.name}: ${column.type}`;
        if (column.nullable === false) report += ' (NOT NULL)';
        if (column.defaultValue !== undefined) report += ` (DEFAULT: ${column.defaultValue})`;
        report += '\n';
      });
      report += '\n';
    });

    return report;
  },

  /**
   * Get table list from database based on driver type
   */
  async getTableList(adapter: IDatabaseAdapter, driver: string): Promise<string[]> {
    switch (driver) {
      case 'mysql': {
        const result = await adapter.query(
          'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()',
          []
        );
        return result.rows.map((row) => row['TABLE_NAME'] as string);
      }

      case 'postgresql': {
        const pgResult = await adapter.query(
          'SELECT tablename FROM pg_tables WHERE schemaname = current_schema()',
          []
        );
        return pgResult.rows.map((row) => row['tablename'] as string);
      }

      case 'sqlite': {
        const sqliteResult = await adapter.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          []
        );
        return sqliteResult.rows.map((row) => row['name'] as string);
      }

      case 'sqlserver': {
        const sqlResult = await adapter.query(
          'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = BASE TABLE',
          []
        );
        return sqlResult.rows.map((row) => row['TABLE_NAME'] as string);
      }

      default:
        throw ErrorFactory.createValidationError(
          `Table listing not supported for driver: ${driver}`
        );
    }
  },

  /**
   * Get detailed schema for a specific table
   */
  async getTableSchema(
    adapter: IDatabaseAdapter,
    tableName: string,
    driver: string
  ): Promise<TableSchema> {
    try {
      // Get column information
      const columns = await SchemaAnalyzer.getTableColumns(adapter, tableName, driver);

      // Get primary key information
      const primaryKey = await SchemaAnalyzer.getPrimaryKey(adapter, tableName, driver);

      // Get row count
      const rowCountResult = await adapter.query(`SELECT COUNT(*) as count FROM ${tableName}`, []);
      const rowCount = (rowCountResult.rows[0]?.['count'] as number) || 0;

      // Get indexes
      const indexes = await SchemaAnalyzer.getTableIndexes(adapter, tableName, driver);

      // Get foreign keys
      const foreignKeys = await SchemaAnalyzer.getForeignKeys(adapter, tableName, driver);

      return {
        name: tableName,
        columns,
        primaryKey: primaryKey || '',
        primaryKeys: primaryKey ? [primaryKey] : [],
        indexes,
        foreignKeys,
        rowCount,
      };
    } catch (error) {
      Logger.error(`Failed to get schema for table ${tableName}:`, error);
      throw ErrorFactory.createTryCatchError(
        `Table schema extraction failed for ${tableName}`,
        error
      );
    }
  },

  /**
   * Get column information for a table
   */
  async getTableColumns(
    adapter: IDatabaseAdapter,
    tableName: string,
    driver: string
  ): Promise<ColumnSchema[]> {
    let query: string;

    switch (driver) {
      case 'mysql':
        query = `
          SELECT
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT,
            EXTRA
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}'
        `;
        break;

      case 'postgresql':
        query = `
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = '${tableName}'
        `;
        break;

      case 'sqlite':
        query = `PRAGMA table_info(${tableName})`;
        break;

      case 'sqlserver':
        query = `
          SELECT
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${tableName}'
        `;
        break;

      default:
        throw ErrorFactory.createValidationError(
          `Column extraction not supported for driver: ${driver}`
        );
    }

    const result = await adapter.query(query, []);

    return result.rows.map((row: Record<string, unknown>) => {
      const column: ColumnSchema = {
        name: (row['COLUMN_NAME'] || row['column_name'] || row['name']) as string,
        type: SchemaAnalyzer.normalizeDataType(
          (row['DATA_TYPE'] || row['data_type'] || row['type']) as string,
          driver
        ),
        nullable: ((row['IS_NULLABLE'] || row['is_nullable'] || 'YES') as string) === 'YES',
        defaultValue: row['COLUMN_DEFAULT'] || row['column_default'],
        autoIncrement: ((row['EXTRA'] || row['extra'] || '') as string).includes('auto_increment'),
      };

      // Clean up undefined values
      column.defaultValue ??= undefined;

      return column;
    });
  },

  /**
   * Get primary key for a table
   */
  async getPrimaryKey(
    adapter: IDatabaseAdapter,
    tableName: string,
    driver: string
  ): Promise<string | null> {
    let query: string;

    switch (driver) {
      case 'mysql':
        query = `
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' AND CONSTRAINT_NAME = 'PRIMARY'
        `;
        break;

      case 'postgresql':
        query = `
          SELECT column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = current_schema() AND tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'
        `;
        break;

      case 'sqlite':
        query = `PRAGMA table_info(${tableName})`;
        break;

      case 'sqlserver':
        query = `
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_NAME = '${tableName}' AND CONSTRAINT_NAME = 'PRIMARY'
        `;
        break;

      default:
        return null;
    }

    try {
      const result = await adapter.query(query, []);
      return result.rows.length > 0
        ? (result.rows[0]['COLUMN_NAME'] as string) ||
            (result.rows[0]['column_name'] as string) ||
            (result.rows[0]['name'] as string)
        : null;
    } catch (error) {
      Logger.warn(`Could not determine primary key for ${tableName}:`, error);
      return null;
    }
  },

  /**
   * Normalize data type from different database systems to D1-compatible types
   */
  normalizeDataType(dataType: string, _driver: string): string {
    const type = (dataType || '').toLowerCase();

    // Convert various data type formats to standard D1 types
    const typeMap: Record<string, string> = {
      // MySQL types
      int: 'integer',
      varchar: 'varchar',
      text: 'text',
      datetime: 'datetime',
      timestamp: 'datetime',
      decimal: 'real',
      double: 'real',
      float: 'real',
      boolean: 'boolean',
      tinyint: 'boolean',
      date: 'date',
      // PostgreSQL types
      'character varying': 'varchar',
      'timestamp without time zone': 'datetime',
      'timestamp with time zone': 'datetime',
      numeric: 'real',
      // SQLite types
      blob: 'blob',
    };

    // Handle type with precision/length
    const normalizedType = type.split('(')[0].trim();

    return typeMap[normalizedType] || 'text';
  },

  /**
   * Get indexes for a table
   */
  async getTableIndexes(
    adapter: IDatabaseAdapter,
    tableName: string,
    driver: string
  ): Promise<IndexSchema[]> {
    const query = SchemaAnalyzer.buildIndexQuery(tableName, driver);

    if (!query) {
      return [];
    }

    try {
      const result = await adapter.query(query, []);
      return SchemaAnalyzer.processIndexResults(result, driver);
    } catch (error) {
      Logger.warn(`Could not determine indexes for ${tableName}:`, error);
      return [];
    }
  },

  /**
   * Build index query for specific driver
   */
  buildIndexQuery(tableName: string, driver: string): string | null {
    switch (driver) {
      case 'mysql':
        return `
          SELECT
            INDEX_NAME,
            COLUMN_NAME,
            NON_UNIQUE
          FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}'
          ORDER BY INDEX_NAME, SEQ_IN_INDEX
        `;

      case 'postgresql':
        return `
          SELECT
            i.indexname,
            a.attname,
            i.indisunique
          FROM pg_indexes i
          JOIN pg_attribute a ON a.attrelid = i.indrelid
          WHERE i.schemaname = current_schema() AND i.tablename = '${tableName}'
        `;

      case 'sqlite':
        return `PRAGMA index_list(${tableName})`;

      case 'sqlserver':
        return `
          SELECT
            i.name AS INDEX_NAME,
            c.name AS COLUMN_NAME,
            i.is_unique
          FROM sys.indexes i
          JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
          JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          JOIN sys.tables t ON i.object_id = t.object_id
          WHERE t.name = '${tableName}'
        `;

      default:
        return null;
    }
  },

  /**
   * Process index results into IndexSchema format
   */
  processIndexResults(result: { rows: Record<string, unknown>[] }, driver: string): IndexSchema[] {
    const indexMap = new Map<string, { columns: string[]; unique: boolean; primary?: boolean }>();

    result.rows.forEach((row) => {
      const indexName = (row['INDEX_NAME'] || row['indexname'] || row['name']) as string;
      const columnName = (row['COLUMN_NAME'] || row['attname'] || row['column_name']) as string;
      const isUnique = SchemaAnalyzer.isIndexUnique(row, driver);

      if (!indexMap.has(indexName)) {
        const newIndex = {
          columns: [],
          unique: isUnique,
          primary: indexName === 'PRIMARY',
        };
        indexMap.set(indexName, newIndex);
      }

      const index = indexMap.get(indexName);
      if (index && columnName && !index.columns.includes(columnName)) {
        index.columns.push(columnName);
      }
    });

    return Array.from(indexMap.entries())
      .filter(([name]) => name && name !== 'PRIMARY')
      .map(([name, data]) => ({
        name,
        columns: data.columns,
        unique: data.unique,
        primary: data.primary,
      }));
  },

  /**
   * Check if index is unique based on driver-specific data
   */
  isIndexUnique(row: Record<string, unknown>, driver: string): boolean {
    switch (driver) {
      case 'mysql':
        return (row['NON_UNIQUE'] as number) === 0;
      case 'postgresql':
        return (row['indisunique'] as boolean) === true;
      case 'sqlserver':
        return (row['is_unique'] as boolean) === true;
      default:
        return false;
    }
  },

  /**
   * Get foreign keys for a table
   */
  async getForeignKeys(
    adapter: IDatabaseAdapter,
    tableName: string,
    driver: string
  ): Promise<ForeignKeySchema[]> {
    const query = SchemaAnalyzer.buildForeignKeyQuery(tableName, driver);

    if (!query) {
      return [];
    }

    try {
      const result = await adapter.query(query, []);
      return result.rows.map((row) => SchemaAnalyzer.processForeignKeyRow(row, tableName));
    } catch (error) {
      Logger.warn(`Could not determine foreign keys for ${tableName}:`, error);
      return [];
    }
  },

  /**
   * Build foreign key query for specific driver
   */
  buildForeignKeyQuery(tableName: string, driver: string): string | null {
    switch (driver) {
      case 'mysql':
        return `
          SELECT
            kcu.CONSTRAINT_NAME AS CONSTRAINT_NAME,
            kcu.COLUMN_NAME AS COLUMN_NAME,
            kcu.REFERENCED_TABLE_NAME AS REFERENCED_TABLE_NAME,
            kcu.REFERENCED_COLUMN_NAME AS REFERENCED_COLUMN_NAME,
            rc.DELETE_RULE AS DELETE_RULE,
            rc.UPDATE_RULE AS UPDATE_RULE
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
            ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
            AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
          WHERE kcu.TABLE_SCHEMA = DATABASE()
            AND kcu.TABLE_NAME = '${tableName}'
            AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        `;

      case 'postgresql':
        return `
          SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS referenced_table_name,
            ccu.column_name AS referenced_column_name,
            rc.delete_rule,
            rc.update_rule
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          LEFT JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = '${tableName}'
            AND tc.table_schema = current_schema()
        `;

      case 'sqlite':
        return `PRAGMA foreign_key_list(${tableName})`;

      case 'sqlserver':
        return `
          SELECT
            f.name AS CONSTRAINT_NAME,
            COL_NAME(fc.parent_column_id) AS COLUMN_NAME,
            OBJECT_NAME(f.referenced_object_id) AS REFERENCED_TABLE_NAME,
            COL_NAME(fc.referenced_column_id) AS REFERENCED_COLUMN_NAME,
            f.delete_referential_action_desc AS DELETE_RULE,
            f.update_referential_action_desc AS UPDATE_RULE
          FROM sys.foreign_keys AS f
          JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.parent_object_id
          WHERE OBJECT_NAME(f.parent_object_id) = '${tableName}'
        `;

      default:
        return null;
    }
  },

  /**
   * Process foreign key row into ForeignKeySchema format
   */
  processForeignKeyRow(row: Record<string, unknown>, tableName: string): ForeignKeySchema {
    const constraintName = (row['CONSTRAINT_NAME'] ||
      row['constraint_name'] ||
      `fk_${tableName}_${row['COLUMN_NAME']}`) as string;
    const columnName = (row['COLUMN_NAME'] || row['column_name'] || row['from']) as string;
    const referencedTable = (row['REFERENCED_TABLE_NAME'] ||
      row['referenced_table_name'] ||
      row['table']) as string;
    const referencedColumn = (row['REFERENCED_COLUMN_NAME'] ||
      row['referenced_column_name'] ||
      row['to']) as string;
    const deleteRule = (row['DELETE_RULE'] || row['delete_rule']) as string;
    const updateRule = (row['UPDATE_RULE'] || row['update_rule']) as string;

    const onDelete = SchemaAnalyzer.mapReferentialAction(deleteRule);
    const onUpdate = SchemaAnalyzer.mapReferentialAction(updateRule);

    return {
      name: constraintName,
      column: columnName,
      referencedTable,
      referencedColumn,
      onDelete,
      onUpdate,
    };
  },

  /**
   * Map referential action string to enum value
   */
  mapReferentialAction(action: string): 'CASCADE' | 'SET NULL' | 'RESTRICT' {
    if (action === 'CASCADE') {
      return 'CASCADE';
    }
    if (action === 'SET NULL') {
      return 'SET NULL';
    }
    return 'RESTRICT';
  },
});
