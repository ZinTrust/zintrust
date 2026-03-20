/**
 * D1 Migrator Types
 * Type definitions for migration operations
 */

import type { Command } from 'commander';

export type SourceDatabaseDriver = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

export interface MigrationConfig {
  sourceConnection: string;
  sourceDriver: SourceDatabaseDriver;
  targetDatabase: string;
  targetType: 'd1' | 'd1-remote';
  batchSize?: number;
  checkpointInterval?: number;
  dryRun?: boolean;
  interactive?: boolean;
  migrationId?: string;
}

export interface MigrationState {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  lastCheckpoint?: Date;
  totalTables: number;
  completedTables: number;
  totalRows: number;
  completedRows: number;
  errors: MigrationError[];
  config: MigrationConfig;
}

export interface CheckpointData {
  migrationId: string;
  table: string;
  lastProcessedId?: string | number;
  processedRows: number;
  totalRows: number;
  checksum?: string;
  timestamp: Date;
  batchIndex: number;
}

export interface SchemaAnalysisResult {
  tables: TableSchema[];
  dependencies: TableDependency[];
  conflicts: SchemaConflict[];
  warnings: SchemaWarning[];
}

export interface DatabaseSchema {
  tables: TableSchema[];
  relationships: TableRelationship[];
  constraints: TableConstraint[];
}

export interface TableRelationship {
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface TableConstraint {
  table: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check' | 'not_null';
  columns: string[];
  definition?: string;
}

export interface TableSchema {
  primaryKey: string;
  name: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  foreignKeys: ForeignKeySchema[];
  primaryKeys: string[];
  rowCount?: number;
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: unknown;
  autoIncrement?: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
  primary?: boolean;
}

export interface ForeignKeySchema {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

export interface TableDependency {
  table: string;
  dependsOn: string[];
  level: number;
}

export interface SchemaConflict {
  type: 'unsupported_type' | 'size_limitation' | 'constraint_incompatible';
  table: string;
  column?: string;
  description: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface SchemaWarning {
  type: 'data_loss_risk' | 'performance_impact' | 'manual_review';
  table: string;
  description: string;
  suggestion?: string;
}

export interface MigrationProgress {
  migrationId: string;
  currentTable: string;
  table: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedRows: number;
  totalTables: number;
  totalRows: number;
  percentage: number;
  errors: Record<string, string>;
  startTime?: Date;
  endTime?: Date;
}

export interface MigrationError {
  table?: string;
  batch?: number;
  error: string;
  timestamp: Date;
  retryCount: number;
  resolved: boolean;
}

export interface DataValidationResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  checksumMatch: boolean;
  missingRows?: string[];
  extraRows?: string[];
  errors: string[];
}

export type CliCommandProvider = {
  getCommand: () => Command;
  name?: string;
};

export type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

export type D1MigratorRegisterModule = {
  MigrateToD1Command: CliCommandProvider;
};
