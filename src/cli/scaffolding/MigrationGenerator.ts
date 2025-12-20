/**
 * MigrationGenerator - Generate database migrations
 * Creates migration files for schema changes
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

export type MigrationType = 'create' | 'alter' | 'drop';

export interface MigrationOptions {
  name: string; // e.g., 'create_users_table', 'add_email_to_users'
  migrationsPath: string; // Path to migrations directory
  type?: MigrationType;
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
export async function generateMigration(
  options: MigrationOptions
): Promise<MigrationScaffoldResult> {
  try {
    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      return {
        success: false,
        migrationName: options.name,
        filePath: '',
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Generate migration filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replaceAll(/[-:T.Z]/g, '')
      .slice(0, 14);
    const filename = `${timestamp}_${options.name}.ts`;
    const filePath = path.join(options.migrationsPath, filename);

    // Check if migration already exists
    if (FileGenerator.fileExists(filePath)) {
      return {
        success: false,
        migrationName: options.name,
        filePath,
        message: `Migration file already exists: ${filePath}`,
      };
    }

    // Generate migration content based on type
    const type = options.type ?? detectType(options.name);
    const content = generateMigrationContent(options.name, type);

    // Write migration file
    FileGenerator.writeFile(filePath, content);

    Logger.info(`✅ Created migration: ${filename}`);

    return {
      success: true,
      migrationName: options.name,
      filePath,
      message: `Migration '${options.name}' created successfully`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error('Migration generation error:', error);
    return {
      success: false,
      migrationName: options.name,
      filePath: '',
      message: `Failed to create migration: ${errorMsg}`,
    };
  }
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
function generateMigrationContent(name: string, type: 'create' | 'alter' | 'drop'): string {
  const className = toPascalCase(name);

  if (type === 'create') {
    return generateCreateMigration(className);
  } else if (type === 'drop') {
    return generateDropMigration(className);
  } else {
    return generateAlterMigration(className);
  }
}

/**
 * Generate CREATE migration
 */
function generateCreateMigration(className: string): string {
  const tableName = getTableNameFromClass(className);

  return `/**
 * Migration: ${className}
 * Creates ${tableName} table
 */

export interface Migration {
  up(): Promise<void>;
  down(): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(): Promise<void> {
    // Create table
    // await db.schema.createTable('${tableName}', (table) => {
    //   table.increments('id').primary();
    //   table.string('name').notNullable();
    //   table.string('email').unique();
    //   table.timestamps();
    // });
  },

  /**
   * Rollback migration
   */
  async down(): Promise<void> {
    // Drop table
    // await db.schema.dropTable('${tableName}');
  },
};
`;
}

/**
 * Generate ALTER migration
 */
function generateAlterMigration(className: string): string {
  const tableName = getTableNameFromClass(className);

  return `/**
 * Migration: ${className}
 * Modifies ${tableName} table
 */

export interface Migration {
  up(): Promise<void>;
  down(): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(): Promise<void> {
    // Add/modify columns
    // await db.schema.alterTable('${tableName}', (table) => {
    //   table.string('new_column').nullable();
    // });
  },

  /**
   * Rollback migration
   */
  async down(): Promise<void> {
    // Remove columns
    // await db.schema.alterTable('${tableName}', (table) => {
    //   table.dropColumn('new_column');
    // });
  },
};
`;
}

/**
 * Generate DROP migration
 */
function generateDropMigration(className: string): string {
  const tableName = getTableNameFromClass(className);

  return `/**
 * Migration: ${className}
 * Drops ${tableName} table
 */

export interface Migration {
  up(): Promise<void>;
  down(): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(): Promise<void> {
    // Drop table
    // await db.schema.dropTable('${tableName}');
  },

  /**
   * Rollback migration
   */
  async down(): Promise<void> {
    // Recreate table
    // await db.schema.createTable('${tableName}', (table) => {
    //   table.increments('id').primary();
    //   table.timestamps();
    // });
  },
};
`;
}

/**
 * Convert class name to table name
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

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * MigrationGenerator creates database migration files
 */
export const MigrationGenerator = {
  validateOptions,
  generateMigration,
};
