/**
 * D1 Migrator Package
 * Migrate any database to Cloudflare D1 with resumable operations
 */

import type { CommandOptions } from '@zintrust/core/cli';
import type { Command } from 'commander';

// CLI Commands
import { MigrateToD1Command } from './cli/MigrateToD1Command';

// Utilities
import { CheckpointManager } from './utils/CheckpointManager';
import { DataValidator } from './utils/DataValidator';

// CLI Components
import { DataMigrator } from './cli/DataMigrator';
import { ProgressTracker } from './cli/ProgressTracker';
import { SchemaAnalyzer } from './cli/SchemaAnalyzer';

// Schema Components
import { SchemaBuilder } from './schema/SchemaBuilder';
import { TypeConverter } from './schema/TypeConverter';
import { SchemaValidator } from './schema/Validator';

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

/**
 * D1 Migrator - Sealed namespace for database migration operations
 * Provides comprehensive migration from MySQL, PostgreSQL, SQLite, SQL Server to D1/D1Remote
 */
type D1MigratorNamespace = Readonly<{
  MigrateToD1Command: D1MigratorCommand;
  CheckpointManager: typeof CheckpointManager;
  DataValidator: typeof DataValidator;
  SchemaAnalyzer: typeof SchemaAnalyzer;
  DataMigrator: typeof DataMigrator;
  ProgressTracker: typeof ProgressTracker;
  TypeConverter: typeof TypeConverter;
  SchemaBuilder: typeof SchemaBuilder;
  SchemaValidator: typeof SchemaValidator;
}>;

export const D1Migrator: D1MigratorNamespace = Object.freeze({
  // CLI Commands
  MigrateToD1Command,

  // Core Components
  CheckpointManager,
  DataValidator,
  SchemaAnalyzer,
  DataMigrator,
  ProgressTracker,

  // Schema Components
  TypeConverter,
  SchemaBuilder,
  SchemaValidator,
});

// Export types for external use
export type {
  CheckpointData,
  ColumnSchema,
  DataValidationResult,
  IndexSchema,
  MigrationConfig,
  MigrationProgress,
  MigrationState,
  TableSchema,
} from './types';

export default D1Migrator;
