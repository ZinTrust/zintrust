import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Common utilities - Sealed namespace for immutability
 */
export const CommonUtils = Object.freeze({
  /**
   * Resolve npm executable path from Node.js installation
   */
  resolveNpmPath(): string {
    const nodeBinDir = path.dirname(process.execPath);
    const candidates =
      process.platform === 'win32'
        ? [path.join(nodeBinDir, 'npm.cmd'), path.join(nodeBinDir, 'npm.exe')]
        : [path.join(nodeBinDir, 'npm')];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw ErrorFactory.createGeneralError(
      'Unable to locate npm executable. Ensure Node.js (with npm) is installed in the standard location.'
    );
  },

  /**
   * STRING UTILITIES
   */

  /**
   * Convert string to camelCase
   */
  camelCase(str: string): string {
    return (
      str
        // First convert PascalCase/camelCase to snake_case format for splitting
        .replaceAll(/([a-z])([A-Z])/g, '$1_$2')
        .split(/[\s_-]+/)
        .map((word, index) => {
          if (index === 0) {
            return word.charAt(0).toLowerCase() + word.slice(1).toLowerCase();
          }
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('')
    );
  },

  /**
   * Convert string to snake_case
   */
  toSnakeCase(str: string): string {
    return str
      .replaceAll(/([a-z])([A-Z])/g, '$1_$2')
      .replaceAll(/([A-Z])/g, '_$1')
      .replaceAll(/(\d)([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/^_/, '')
      .replaceAll(/__+/g, '_');
  },

  /**
   * Convert string to PascalCase
   */
  toPascalCase(str: string): string {
    return str
      .replaceAll(/([a-z])([A-Z])/g, '$1_$2') // Add underscore before capital letters in camelCase
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  },

  /**
   * FILE SYSTEM UTILITIES
   */

  /**
   * Check if file exists
   */
  fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  },

  /**
   * Ensure directory exists, create if missing
   */
  ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  },

  /**
   * Read file contents as string
   */
  readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw ErrorFactory.createGeneralError(
        `Failed to read file: ${filePath}. ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Write file with optional directory creation
   */
  writeFile(filePath: string, content: string, createDir = true): void {
    try {
      if (createDir) {
        const dir = path.dirname(filePath);
        this.ensureDir(dir);
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw ErrorFactory.createGeneralError(
        `Failed to write file: ${filePath}. ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Delete file if it exists
   */
  deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw ErrorFactory.createGeneralError(
        `Failed to delete file: ${filePath}. ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * TIMESTAMP UTILITIES
   */

  /**
   * Get current timestamp in ISO format
   */
  getCurrentTimestamp(): string {
    return new Date().toISOString();
  },

  /**
   * Format timestamp for filenames (YYYY-MM-DDTHH-MM-SS-SSSZ)
   */
  formatTimestamp(date: Date = new Date()): string {
    return date.toISOString().replaceAll(/[:.]/g, '-');
  },

  /**
   * Parse ISO timestamp string to Date
   */
  parseTimestamp(timestamp: string): Date {
    try {
      const date = new Date(timestamp);
      if (date.toString() === 'Invalid Date') {
        throw ErrorFactory.createGeneralError('Invalid date');
      }
      return date;
    } catch (error) {
      throw ErrorFactory.createGeneralError(`Failed to parse timestamp: ${timestamp}`, error);
    }
  },

  /**
   * VALIDATION UTILITIES
   */

  /**
   * Extract error message from unknown error type
   */
  extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error !== undefined && error !== null && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return 'Unknown error occurred';
  },

  /**
   * Validate options object and throw if invalid
   */
  validateOptions(
    options: Record<string, unknown>,
    requiredFields: string[],
    context: string
  ): void {
    const missingFields = requiredFields.filter(
      (field) => options[field] === undefined || options[field] === null
    );
    if (missingFields.length > 0) {
      throw ErrorFactory.createGeneralError(
        `${context}: Missing required options: ${missingFields.join(', ')}`
      );
    }
  },

  /**
   * Check if value is valid (not null, undefined, or empty string)
   */
  isValid(value: unknown): boolean {
    return value !== null && value !== undefined && value !== '';
  },

  /**
   * Ensure value is string, throw otherwise
   */
  ensureString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw ErrorFactory.createGeneralError(`${fieldName} must be a string, got ${typeof value}`);
    }
    return value;
  },

  /**
   * Ensure value is object, throw otherwise
   */
  ensureObject(value: unknown, fieldName: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      throw ErrorFactory.createGeneralError(`${fieldName} must be an object, got ${typeof value}`);
    }
    return value as Record<string, unknown>;
  },
});

// Re-export for backward compatibility
export const resolveNpmPath = (): string => CommonUtils.resolveNpmPath();
