/**
 * Schema Builder
 * Builds D1/SQLite compatible schemas from source schemas
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import type { ColumnSchema, TableSchema } from '../types';
import { DataValidator } from '../utils/DataValidator';
import { TypeConverter } from './TypeConverter';

const normalizeNullLikeDefaultValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase() === 'null' ? null : value;
};

const getPrimaryKeyColumns = (table: TableSchema): string[] => {
  if (table.primaryKeys.length > 0) {
    return table.primaryKeys;
  }

  return table.primaryKey ? [table.primaryKey] : [];
};

const getAutoIncrementPrimaryKeyColumn = (table: TableSchema): ColumnSchema | undefined => {
  const primaryKeyColumns = getPrimaryKeyColumns(table);
  if (primaryKeyColumns.length !== 1) {
    return undefined;
  }

  const primaryKeyName = primaryKeyColumns[0];
  return table.columns.find((column) => column.name === primaryKeyName && column.autoIncrement);
};

/**
 * SchemaBuilder - Sealed namespace for schema building
 * Provides D1 schema generation from source schemas
 */
export const SchemaBuilder = Object.freeze({
  /**
   * Build D1 schema from source schema
   */
  buildD1Schema(sourceSchema: TableSchema[], sourceDriver: string): TableSchema[] {
    Logger.info('Building D1 schema...');

    return sourceSchema.map((table) => SchemaBuilder.buildD1Table(table, sourceDriver));
  },

  /**
   * Build D1 table from source table
   */
  buildD1Table(sourceTable: TableSchema, sourceDriver: string): TableSchema {
    const sanitizedTableName = DataValidator.sanitizeTableName(sourceTable.name);
    const autoIncrementPrimaryKeyName = getAutoIncrementPrimaryKeyColumn(sourceTable)?.name;

    const d1Table: TableSchema = <TableSchema>{
      name: sanitizedTableName,
      columns: sourceTable.columns.map((column) => {
        const d1Column = SchemaBuilder.buildD1Column(column, sourceDriver);

        if (column.name !== autoIncrementPrimaryKeyName) {
          return d1Column;
        }

        return {
          ...d1Column,
          type: 'INTEGER',
          nullable: false,
          defaultValue: undefined,
          autoIncrement: true,
        };
      }),
      primaryKey: sourceTable.primaryKeys?.[0] || '',
      indexes: sourceTable.indexes || [],
      primaryKeys: sourceTable.primaryKeys || [],
      foreignKeys: sourceTable.foreignKeys || [],
    };

    Logger.info(`Converted table: ${sourceTable.name} -> ${sanitizedTableName}`);
    return d1Table;
  },

  /**
   * Build D1 column from source column
   */
  buildD1Column(sourceColumn: ColumnSchema, sourceDriver: string): ColumnSchema {
    const d1Type = TypeConverter.convertToD1Type(sourceColumn.type, sourceDriver);
    const warnings = TypeConverter.getConversionWarnings(sourceColumn.type, d1Type);

    // Log conversion warnings
    warnings.forEach((warning) => {
      Logger.warn(`Column conversion warning: ${sourceColumn.name} - ${warning}`);
    });

    const d1Column: ColumnSchema = {
      name: sourceColumn.name,
      type: d1Type,
      nullable: sourceColumn.nullable,
      defaultValue: sourceColumn.defaultValue,
      autoIncrement: sourceColumn.autoIncrement,
    };

    return d1Column;
  },

  /**
   * Generate CREATE TABLE SQL
   */
  generateCreateTableSQL(table: TableSchema): string {
    let sql = `CREATE TABLE \`${table.name}\` (\n`;

    const autoIncrementPrimaryKeyColumn = getAutoIncrementPrimaryKeyColumn(table);

    const columnDefinitions = table.columns.map((column) =>
      SchemaBuilder.generateColumnDefinition(
        column,
        autoIncrementPrimaryKeyColumn?.name === column.name
      )
    );

    sql += columnDefinitions.join(',\n');

    if (table.primaryKey && autoIncrementPrimaryKeyColumn === undefined) {
      const keyList = table.primaryKey;
      sql += `,\n  PRIMARY KEY (${keyList})`;
    }

    sql += '\n);';

    return sql;
  },

  /**
   * Generate column definition
   */
  generateColumnDefinition(column: ColumnSchema, inlinePrimaryKey: boolean = false): string {
    if (inlinePrimaryKey) {
      return `  \`${column.name}\` INTEGER PRIMARY KEY AUTOINCREMENT`;
    }

    let definition = `  \`${column.name}\` ${column.type}`;

    if (!column.nullable) {
      definition += ' NOT NULL';
    }

    if (column.defaultValue !== undefined) {
      definition += ` DEFAULT ${SchemaBuilder.formatDefaultValue(column.defaultValue)}`;
    }

    return definition;
  },

  /**
   * Format default value for SQL
   */
  formatDefaultValue(value: unknown): string {
    const normalizedValue = normalizeNullLikeDefaultValue(value);

    if (normalizedValue === null) {
      return 'NULL';
    }

    if (typeof normalizedValue === 'string') {
      return `'${normalizedValue.replaceAll("'", "''")}'`;
    }

    if (typeof normalizedValue === 'boolean') {
      return normalizedValue ? '1' : '0';
    }

    return String(normalizedValue);
  },

  /**
   * Generate index statements
   */
  generateIndexSQL(table: TableSchema): string[] {
    const indexes: string[] = [];

    if (table.indexes) {
      table.indexes.forEach((index) => {
        const indexName = `idx_${table.name}_${index.columns.join('_')}`;
        const columns = index.columns.map((col) => `\`${col}\``).join(', ');

        let sql = `CREATE`;
        if (index.unique) {
          sql += ' UNIQUE';
        }
        sql += ` INDEX \`${indexName}\` ON \`${table.name}\` (${columns});`;

        indexes.push(sql);
      });
    }

    return indexes;
  },

  /**
   * Generate complete schema SQL
   */
  generateSchemaSQL(tables: TableSchema[]): string {
    let sql = '-- D1 Schema Migration\n';
    sql += '-- Generated by ZinTrust D1 Migrator\n\n';

    tables.forEach((table) => {
      sql += SchemaBuilder.generateCreateTableSQL(table);
      sql += '\n\n';

      const indexes = SchemaBuilder.generateIndexSQL(table);
      indexes.forEach((indexSql) => {
        sql += indexSql + '\n';
      });

      if (indexes.length > 0) {
        sql += '\n';
      }
    });

    return sql;
  },

  /**
   * Validate built schema
   */
  validateSchema(tables: TableSchema[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    tables.forEach((table) => {
      // Check table name
      if (!DataValidator.sanitizeTableName(table.name)) {
        errors.push(`Invalid table name: ${table.name}`);
      }

      // Check columns
      table.columns.forEach((column) => {
        if (!column.name || column.name.trim() === '') {
          errors.push(`Empty column name in table: ${table.name}`);
        }

        if (!column.type || column.type.trim() === '') {
          errors.push(`Empty column type: ${table.name}.${column.name}`);
        }
      });

      if (table.primaryKey) {
        const hasPrimaryKeyColumn = table.columns.some(
          (column) => column.name === table.primaryKey
        );
        if (!hasPrimaryKeyColumn) {
          errors.push(`Primary key column '${table.primaryKey}' not found in table: ${table.name}`);
        }
      }

      const autoIncrementPrimaryKeyColumn = getAutoIncrementPrimaryKeyColumn(table);
      if (autoIncrementPrimaryKeyColumn) {
        const createSql = SchemaBuilder.generateCreateTableSQL(table);
        const expectedPrimaryKeyFragment = `\`${autoIncrementPrimaryKeyColumn.name}\` INTEGER PRIMARY KEY AUTOINCREMENT`;
        if (!createSql.includes(expectedPrimaryKeyFragment)) {
          errors.push(
            `Auto-increment primary key '${table.name}.${autoIncrementPrimaryKeyColumn.name}' must be emitted as INTEGER PRIMARY KEY AUTOINCREMENT for D1`
          );
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  assertValidSchema(tables: TableSchema[]): void {
    const validation = SchemaBuilder.validateSchema(tables);
    if (validation.valid) {
      return;
    }

    throw ErrorFactory.createValidationError(
      `Generated D1 schema is invalid: ${validation.errors.join('; ')}`
    );
  },
});
