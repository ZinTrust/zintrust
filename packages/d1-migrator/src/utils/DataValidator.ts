/**
 * Data Validator
 * Integrity checks and validation for migrated data
 */

import { Logger } from '@zintrust/core';
import type { DataValidationResult } from '../types';

/**
 * DataValidator - Sealed namespace for data integrity validation
 * Provides comprehensive validation of migrated data
 */
export const DataValidator = Object.freeze({
  /**
   * Validate data integrity between source and target
   */
  async validateDataIntegrity(
    sourceCount: number,
    targetCount: number,
    tableName: string
  ): Promise<boolean> {
    const isValid = sourceCount === targetCount;

    if (isValid) {
      Logger.info(`Data integrity check passed for table ${tableName}: ${targetCount} rows`);
    } else {
      Logger.warn(
        `Data integrity check failed for table ${tableName}: source=${sourceCount}, target=${targetCount}`
      );
    }

    return isValid;
  },

  /**
   * Generate checksum for data validation
   */
  async generateChecksum(data: unknown[]): Promise<string> {
    const crypto = await import('node:crypto');
    const dataString = JSON.stringify(data);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  },

  /**
   * Validate data checksums
   */
  async validateChecksum(
    sourceData: unknown[],
    targetData: unknown[],
    tableName: string
  ): Promise<boolean> {
    const sourceChecksum = await DataValidator.generateChecksum(sourceData);
    const targetChecksum = await DataValidator.generateChecksum(targetData);

    const isValid = sourceChecksum === targetChecksum;

    if (isValid) {
      Logger.info(`Checksum validation passed for table ${tableName}`);
    } else {
      Logger.warn(`Checksum validation failed for table ${tableName}`);
      Logger.debug(`Source checksum: ${sourceChecksum}`);
      Logger.debug(`Target checksum: ${targetChecksum}`);
    }

    return isValid;
  },

  /**
   * Comprehensive data validation
   */
  async validateTable(
    sourceData: unknown[],
    targetData: unknown[],
    tableName: string
  ): Promise<DataValidationResult> {
    const sourceCount = sourceData.length;
    const targetCount = targetData.length;

    const countMatch = await DataValidator.validateDataIntegrity(
      sourceCount,
      targetCount,
      tableName
    );
    const checksumMatch = await DataValidator.validateChecksum(sourceData, targetData, tableName);

    const errors: string[] = [];

    if (!countMatch) {
      errors.push(`Row count mismatch: source=${sourceCount}, target=${targetCount}`);
    }

    if (!checksumMatch) {
      errors.push('Data checksum mismatch detected');
    }

    const result: DataValidationResult = {
      table: tableName,
      sourceCount,
      targetCount,
      checksumMatch,
      errors,
    };

    if (errors.length === 0) {
      Logger.info(`Table validation passed: ${tableName}`);
    } else {
      Logger.error(`Table validation failed: ${tableName}`, errors);
    }

    return result;
  },

  /**
   * Validate schema compatibility
   */
  validateSchemaCompatibility(
    sourceSchema: unknown,
    targetSchema: unknown,
    tableName: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic schema validation - can be extended based on requirements
    if (!sourceSchema || !targetSchema) {
      errors.push('Schema information is missing');
    }

    // Add more specific schema validation logic here
    // For now, just basic structure validation

    const valid = errors.length === 0;

    if (valid) {
      Logger.info(`Schema compatibility validated for table ${tableName}`);
    } else {
      Logger.warn(`Schema compatibility issues detected for table ${tableName}:`, errors);
    }

    return { valid, errors };
  },

  /**
   * Sanitize table name for D1 compatibility
   */
  sanitizeTableName(tableName: string): string {
    // D1/SQLite has specific naming requirements
    // Preserve original casing while replacing invalid characters with underscores
    let sanitized = tableName.replaceAll(/[^a-zA-Z0-9_-]/g, '_');

    // Remove leading and trailing underscores (safer than regex)
    while (sanitized.startsWith('_')) {
      sanitized = sanitized.slice(1);
    }
    while (sanitized.endsWith('_')) {
      sanitized = sanitized.slice(0, -1);
    }

    return sanitized.substring(0, 64); // SQLite limit
  },

  /**
   * Validate column type conversion
   */
  validateColumnType(
    sourceType: string,
    targetType: string,
    tableName: string,
    columnName: string
  ): { valid: boolean; warning?: string } {
    // Define type compatibility matrix
    const compatibleTypes: Record<string, string[]> = {
      varchar: ['text', 'varchar'],
      text: ['text', 'varchar', 'longtext'],
      int: ['integer', 'int', 'bigint'],
      bigint: ['integer', 'bigint'],
      decimal: ['real', 'decimal', 'double'],
      datetime: ['text', 'datetime'],
      boolean: ['integer', 'boolean'],
    };

    const normalizedTargetType = targetType.toLowerCase();
    const normalizedSourceType = sourceType.toLowerCase();

    const validTargetTypes = compatibleTypes[normalizedSourceType];
    const isValid = validTargetTypes?.includes(normalizedTargetType) || false;

    let warning: string | undefined;

    if (!isValid) {
      warning = `Type conversion may cause data loss: ${sourceType} -> ${targetType} in ${tableName}.${columnName}`;
      Logger.warn(warning);
    }

    return { valid: isValid, warning };
  },
});
