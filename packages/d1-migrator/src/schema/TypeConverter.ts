/**
 * Type Converter
 * Converts database types between different database systems
 */

import { Logger } from '@zintrust/core/logger';

/**
 * TypeConverter - Sealed namespace for type conversion
 * Provides database type conversion utilities
 */
export const TypeConverter = Object.freeze({
  /**
   * Convert column type to D1/SQLite compatible type
   */
  convertToD1Type(sourceType: string, sourceDriver: string): string {
    const normalizedType = sourceType.toLowerCase().trim();

    // MySQL conversions
    if (sourceDriver === 'mysql') {
      return TypeConverter.convertMySQLType(normalizedType);
    }

    // PostgreSQL conversions
    if (sourceDriver === 'postgresql') {
      return TypeConverter.convertPostgreSQLType(normalizedType);
    }

    // SQL Server conversions
    if (sourceDriver === 'sqlserver') {
      return TypeConverter.convertSQLServerType(normalizedType);
    }

    // SQLite is already compatible
    if (sourceDriver === 'sqlite') {
      return normalizedType;
    }

    // Default fallback
    Logger.warn(`Unknown source type: ${normalizedType}, defaulting to TEXT`);
    return 'TEXT';
  },

  /**
   * Convert MySQL types to D1
   */
  convertMySQLType(type: string): string {
    const conversions: Record<string, string> = {
      varchar: 'TEXT',
      char: 'TEXT',
      text: 'TEXT',
      longtext: 'TEXT',
      mediumtext: 'TEXT',
      tinytext: 'TEXT',
      int: 'INTEGER',
      integer: 'INTEGER',
      bigint: 'INTEGER',
      smallint: 'INTEGER',
      tinyint: 'INTEGER',
      decimal: 'REAL',
      numeric: 'REAL',
      float: 'REAL',
      double: 'REAL',
      datetime: 'TEXT',
      timestamp: 'TEXT',
      date: 'TEXT',
      time: 'TEXT',
      boolean: 'INTEGER',
      'tinyint(1)': 'INTEGER',
      json: 'TEXT',
      enum: 'TEXT',
      set: 'TEXT',
      blob: 'BLOB',
      longblob: 'BLOB',
      mediumblob: 'BLOB',
      tinyblob: 'BLOB',
    };

    return conversions[type] || 'TEXT';
  },

  /**
   * Convert PostgreSQL types to D1
   */
  convertPostgreSQLType(type: string): string {
    const conversions: Record<string, string> = {
      varchar: 'TEXT',
      'character varying': 'TEXT',
      char: 'TEXT',
      character: 'TEXT',
      text: 'TEXT',
      integer: 'INTEGER',
      int: 'INTEGER',
      int4: 'INTEGER',
      bigint: 'INTEGER',
      int8: 'INTEGER',
      smallint: 'INTEGER',
      int2: 'INTEGER',
      decimal: 'REAL',
      numeric: 'REAL',
      real: 'REAL',
      float4: 'REAL',
      'double precision': 'REAL',
      float8: 'REAL',
      timestamp: 'TEXT',
      timestamptz: 'TEXT',
      date: 'TEXT',
      time: 'TEXT',
      timetz: 'TEXT',
      boolean: 'INTEGER',
      bool: 'INTEGER',
      json: 'TEXT',
      jsonb: 'TEXT',
      uuid: 'TEXT',
      bytea: 'BLOB',
    };

    return conversions[type] || 'TEXT';
  },

  /**
   * Convert SQL Server types to D1
   */
  convertSQLServerType(type: string): string {
    const conversions: Record<string, string> = {
      varchar: 'TEXT',
      char: 'TEXT',
      nvarchar: 'TEXT',
      nchar: 'TEXT',
      text: 'TEXT',
      ntext: 'TEXT',
      int: 'INTEGER',
      integer: 'INTEGER',
      bigint: 'INTEGER',
      smallint: 'INTEGER',
      tinyint: 'INTEGER',
      decimal: 'REAL',
      numeric: 'REAL',
      float: 'REAL',
      real: 'REAL',
      datetime: 'TEXT',
      datetime2: 'TEXT',
      smalldatetime: 'TEXT',
      date: 'TEXT',
      time: 'TEXT',
      bit: 'INTEGER',
      uniqueidentifier: 'TEXT',
      varbinary: 'BLOB',
      binary: 'BLOB',
      image: 'BLOB',
    };

    return conversions[type] || 'TEXT';
  },

  /**
   * Convert data value for D1 compatibility
   */
  convertValue(value: unknown, targetType: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle boolean conversion
    if (targetType === 'INTEGER' && typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    // Handle date/time conversion
    if (targetType === 'TEXT' && value instanceof Date) {
      return value.toISOString();
    }

    // Handle JSON conversion
    if (targetType === 'TEXT' && typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value;
  },

  /**
   * Get type conversion warnings
   */
  getConversionWarnings(sourceType: string, targetType: string): string[] {
    const warnings: string[] = [];

    const normalizedSourceType = sourceType.toLowerCase();

    // Precision loss warnings
    if (normalizedSourceType.includes('decimal') && targetType === 'REAL') {
      warnings.push('Decimal to REAL conversion may cause precision loss');
    }

    // Size limitations
    if (normalizedSourceType.includes('longtext') && targetType === 'TEXT') {
      warnings.push('Large text fields may have size limitations in SQLite');
    }

    // Boolean conversion
    if (normalizedSourceType.includes('boolean') && targetType === 'INTEGER') {
      warnings.push('Boolean values will be converted to 0/1 integers');
    }

    // JSON conversion
    if (normalizedSourceType.includes('json') && targetType === 'TEXT') {
      warnings.push('JSON fields will be stored as text strings');
    }

    return warnings;
  },
});
