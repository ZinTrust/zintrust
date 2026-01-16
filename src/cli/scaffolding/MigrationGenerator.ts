/**
 * MigrationGenerator - Generate database migrations
 * Creates migration files for schema changes
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { CommonUtils } from '@common/index';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';

export type MigrationType = 'create' | 'alter' | 'drop';

export interface MigrationOptions {
  name: string; // e.g., 'create_users_table', 'add_email_to_users'
  migrationsPath: string; // Path to migrations directory
  type?: MigrationType;
  /**
   * Optional explicit table name to use in generated content.
   * When provided, the generator will use it instead of inferring from the migration name.
   */
  table?: string;
  /**
   * Optional column name hint for alter migrations.
   * When provided, the generator will use it in the example placeholder.
   */
  column?: string;
}

export interface MigrationScaffoldResult {
  success: boolean;
  migrationName: string;
  filePath: string;
  message: string;
}

/**
 * Validate migration options
 */
export function validateOptions(options: MigrationOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options.name.trim().length === 0) {
    errors.push('Migration name is required');
  }

  if (!/^[a-z_]+$/.test(options.name)) {
    errors.push('Migration name must contain only lowercase letters and underscores');
  }

  if (options.migrationsPath === '' || !FileGenerator.directoryExists(options.migrationsPath)) {
    errors.push(`Migrations directory does not exist: ${options.migrationsPath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate migration file
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function generateMigration(options: MigrationOptions): Promise<MigrationScaffoldResult> {
  try {
    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      return Promise.resolve({
        success: false,
        migrationName: options.name,
        filePath: '',
        message: `Validation failed: ${validation.errors.join(', ')}`,
      });
    }

    const existing = findExistingMigrationFile(options.migrationsPath, options.name);
    if (existing !== undefined) {
      return Promise.resolve({
        success: false,
        migrationName: options.name,
        filePath: existing,
        message: `Migration '${options.name}' already exists: ${path.basename(existing)}`,
      });
    }

    // Generate migration filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replaceAll(/[-:T.Z]/g, '')
      .slice(0, 14);
    const filename = `${timestamp}_${options.name}.ts`;
    const filePath = path.join(options.migrationsPath, filename);

    // Defensive: exact timestamped file already exists.
    if (FileGenerator.fileExists(filePath)) {
      return Promise.resolve({
        success: false,
        migrationName: options.name,
        filePath,
        message: `Migration file already exists: ${filePath}`,
      });
    }

    // Generate migration content based on type
    const type = options.type ?? detectType(options.name);
    const content = generateMigrationContent({
      name: options.name,
      type,
      migrationsPath: options.migrationsPath,
      table: options.table,
      column: options.column,
    });

    // Write migration file
    FileGenerator.writeFile(filePath, content);

    Logger.info(`✅ Created migration: ${filename}`);

    return Promise.resolve({
      success: true,
      migrationName: options.name,
      filePath,
      message: `Migration '${options.name}' created successfully`,
    });
  } catch (error) {
    Logger.error('Migration generation error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Promise.resolve({
      success: false,
      migrationName: options.name,
      filePath: '',
      message: `Failed to create migration: ${errorMsg}`,
    });
  }
}

function findExistingMigrationFile(migrationsPath: string, name: string): string | undefined {
  const suffix = `_${name}.ts`;
  const files = FileGenerator.listFiles(migrationsPath, false);

  for (const file of files) {
    const base = path.basename(file);
    if (base.endsWith(suffix)) return file;
  }

  return undefined;
}

/**
 * Detect migration type from name
 */
function detectType(name: string): 'create' | 'alter' | 'drop' {
  if (name.startsWith('create_')) return 'create';
  if (name.startsWith('drop_')) return 'drop';
  return 'alter';
}

/**
 * Generate migration file content
 */
function generateMigrationContent(options: {
  name: string;
  type: 'create' | 'alter' | 'drop';
  migrationsPath: string;
  table?: string;
  column?: string;
}): string {
  const className = CommonUtils.toPascalCase(options.name);
  const importBlock = resolveMigrationImportBlock(options.migrationsPath);

  if (options.type === 'create') {
    return generateCreateMigration({
      className,
      importBlock,
      tableName: options.table ?? getTableNameFromMigrationName(options.name),
    });
  } else if (options.type === 'drop') {
    return generateDropMigration({
      className,
      importBlock,
      tableName: options.table ?? getTableNameFromMigrationName(options.name),
    });
  } else {
    return generateAlterMigration({
      className,
      importBlock,
      tableName: options.table ?? getTableNameFromMigrationName(options.name),
      exampleColumn: options.column,
    });
  }
}

function resolveMigrationImportBlock(migrationsPath: string): string {
  const projectRoot = path.resolve(migrationsPath, '..', '..');
  const packageJsonPath = path.join(projectRoot, 'package.json');

  if (FileGenerator.fileExists(packageJsonPath)) {
    try {
      const pkgRaw = FileGenerator.readFile(packageJsonPath);
      const pkg = JSON.parse(pkgRaw) as { name?: unknown };
      if (pkg.name === '@zintrust/core') {
        return `import type { IDatabase } from '@orm/Database';\nimport { Schema as MigrationSchema, type Blueprint } from '@migrations/schema';`;
      }
    } catch {
      // fall through
    }
  }

  return `import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';`;
}

/**
 * Generate CREATE migration
 */
function generateCreateMigration(options: {
  className: string;
  importBlock: string;
  tableName: string;
}): string {
  const { className, importBlock, tableName } = options;

  return `/**
 * Migration: ${className}
 * Creates ${tableName} table
 */

${importBlock}

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('${tableName}', (table: Blueprint) => {
      table.id();
      table.timestamps();
    });
  },

  /**
   * Rollback migration
   */
  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('${tableName}');
  },
};
`;
}

/**
 * Generate ALTER migration
 */
function generateAlterMigration(options: {
  className: string;
  importBlock: string;
  tableName: string;
  exampleColumn?: string;
}): string {
  const { className, importBlock, tableName, exampleColumn } = options;
  const hasConcreteColumn = typeof exampleColumn === 'string' && exampleColumn.trim().length > 0;
  const example = hasConcreteColumn ? exampleColumn : 'new_column';

  const tableBody = hasConcreteColumn
    ? `      table.string('${example}');
      // Example:
      // table.dropColumn('old_column');
      // table.index('new_column');`
    : `      // Example:
      // table.string('${example}');
      // table.dropColumn('old_column');
      // table.index('new_column');`;

  return `/**
 * Migration: ${className}
 * Modifies ${tableName} table
 */

${importBlock}

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('${tableName}', (table: Blueprint) => {
${tableBody}
    });
  },

  /**
   * Rollback migration
   */
  async down(_db: IDatabase): Promise<void> {
    // Note: dropping columns/FKs varies by driver; SQLite/D1 requires a table rebuild.
  },
};
`;
}

/**
 * Generate DROP migration
 */
function generateDropMigration(options: {
  className: string;
  importBlock: string;
  tableName: string;
}): string {
  const { className, importBlock, tableName } = options;

  return `/**
 * Migration: ${className}
 * Drops ${tableName} table
 */

${importBlock}

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('${tableName}');
  },

  /**
   * Rollback migration
   */
  async down(_db: IDatabase): Promise<void> {
    // Recreate table (DB-specific). Consider adding back columns explicitly.
  },
};
`;
}

/**
 * Convert name to table name
 */
function getTableNameFromClass(className: string): string {
  // Remove prefixes
  let tableName = className
    .replace(/^Create/, '')
    .replace(/^Drop/, '')
    .replace(/^Alter/, '');

  // Convert PascalCase to snake_case
  tableName = tableName
    .replaceAll(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

  // Remove 'table' suffix if present
  if (tableName.endsWith('_table')) {
    tableName = tableName.slice(0, -6); // Remove '_table'
  }

  // For ALTER migrations like "add_status_to_orders", extract the table name (last word)
  if (tableName.includes('_to_')) {
    const parts = tableName.split('_to_');
    tableName = parts.at(-1) ?? tableName;
  }

  // Make plural if not already
  if (!tableName.endsWith('s')) {
    tableName += 's';
  }

  return tableName;
}

function getTableNameFromMigrationName(name: string): string {
  if (name.endsWith('_table')) {
    const ensurePlural = (t: string): string => (t.endsWith('s') ? t : `${t}s`);
    const withoutSuffix = name.slice(0, -'_table'.length);
    if (withoutSuffix.startsWith('create_'))
      return ensurePlural(withoutSuffix.slice('create_'.length));
    if (withoutSuffix.startsWith('drop_')) return ensurePlural(withoutSuffix.slice('drop_'.length));
    if (withoutSuffix.includes('_to_'))
      return ensurePlural(withoutSuffix.split('_to_').at(-1) ?? withoutSuffix);
    if (withoutSuffix.startsWith('add_')) {
      // Convention: add_<column>_<table>_table (table is the last segment)
      const parts = withoutSuffix.split('_');
      const last = parts.at(-1);
      if (typeof last === 'string' && last.length > 0) return ensurePlural(last);
    }
  }

  return getTableNameFromClass(CommonUtils.toPascalCase(name));
}

/**
 * MigrationGenerator creates database migration files
 */
export const MigrationGenerator = Object.freeze({
  validateOptions,
  generateMigration,
});
