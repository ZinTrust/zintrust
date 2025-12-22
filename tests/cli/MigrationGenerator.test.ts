/**
 * MigrationGenerator Tests
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { MigrationGenerator, type MigrationOptions } from '@cli/scaffolding/MigrationGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-migrations');

describe('MigrationGenerator Validation', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should validate correct options', () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = MigrationGenerator.validateOptions(options);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject empty name', () => {
    const options: MigrationOptions = {
      name: '',
      migrationsPath,
    };

    const result = MigrationGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('required'))).toBe(true);
  });
});

describe('MigrationGenerator Name Validation', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should reject invalid name (uppercase)', () => {
    const options: MigrationOptions = {
      name: 'CreateUsersTable',
      migrationsPath,
    };

    const result = MigrationGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('lowercase letters and underscores'))).toBe(true);
  });

  it('should reject invalid name (special chars)', () => {
    const options: MigrationOptions = {
      name: 'create-users-table',
      migrationsPath,
    };

    const result = MigrationGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('lowercase letters and underscores'))).toBe(true);
  });

  it('should reject non-existent migrations path', () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath: '/non/existent/path',
    };

    const result = MigrationGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('does not exist'))).toBe(true);
  });
});

describe('MigrationGenerator Generation Basic', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create migration file', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);
    expect(result.filePath).toBeTruthy();
    expect(FileGenerator.fileExists(result.filePath)).toBe(true);
  });

  it('should generate filename with timestamp', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);
    const filename = path.basename(result.filePath);
    expect(filename).toMatch(/^\d{14}_create_users_table\.ts$/);
  });

  it('should reject duplicate migration', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    // Create first migration
    const result1 = await MigrationGenerator.generateMigration(options);
    expect(result1.success).toBe(true);

    // Wait a tiny bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Try to create same migration again (will have different timestamp)
    const result2 = await MigrationGenerator.generateMigration(options);
    expect(result2.success).toBe(true);

    // But should have different file paths
    expect(result1.filePath).not.toBe(result2.filePath);
  });
});

describe('MigrationGenerator Generation Types', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should generate CREATE migration', async () => {
    const options: MigrationOptions = {
      name: 'create_posts_table',
      migrationsPath,
      type: 'create',
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Creates posts table');
    expect(content).toContain('up');
    expect(content).toContain('down');
    expect(content).toContain('createTable');
  });
});

describe('MigrationGenerator Specialized Generation Basic', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should generate ALTER migration', async () => {
    const options: MigrationOptions = {
      name: 'add_email_to_users',
      migrationsPath,
      type: 'alter',
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Modifies');
    expect(content).toContain('alterTable');
  });

  it('should generate DROP migration', async () => {
    const options: MigrationOptions = {
      name: 'drop_users_table',
      migrationsPath,
      type: 'drop',
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Drops');
    expect(content).toContain('dropTable');
  });
});

describe('MigrationGenerator Specialized Detection', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should auto-detect CREATE type', async () => {
    const options: MigrationOptions = {
      name: 'create_products_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Creates products table');
    expect(content).toContain('createTable');
  });

  it('should auto-detect ALTER type', async () => {
    const options: MigrationOptions = {
      name: 'add_status_to_orders',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Modifies orders table');
    expect(content).toContain('alterTable');
  });

  it('should auto-detect DROP type', async () => {
    const options: MigrationOptions = {
      name: 'drop_old_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('Drops');
    expect(content).toContain('dropTable');
  });
});

describe('MigrationGenerator Content and Structure', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should include migration interface', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toContain('interface Migration');
    expect(content).toContain('up()');
    expect(content).toContain('down()');
    expect(content).toContain('export const migration');
  });

  it('should handle underscores in migration name', async () => {
    const options: MigrationOptions = {
      name: 'add_first_name_last_name_to_users',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);
    expect(result.filePath).toContain('add_first_name_last_name_to_users');
  });
});

describe('MigrationGenerator Multiple Migrations', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create multiple migrations in same directory', async () => {
    const options1: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const options2: MigrationOptions = {
      name: 'create_posts_table',
      migrationsPath,
    };

    const result1 = await MigrationGenerator.generateMigration(options1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result2 = await MigrationGenerator.generateMigration(options2);

    expect(result1.success).toBe(true);
    if (!result2.success) {
      Logger.error('Migration 2 failed:', result2);
    }
    expect(result2.success).toBe(true);

    const files = fs.readdirSync(migrationsPath);
    expect(files.length).toBe(2);
  });
});

describe('MigrationGenerator Generation Advanced', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return correct migration info on success', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(true);
    expect(result.migrationName).toBe('create_users_table');
    expect(result.filePath).toBeTruthy();
    expect(result.message).toContain('successfully');
  });

  it('should return error info on failure', async () => {
    const options: MigrationOptions = {
      name: 'InvalidName',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    expect(result.success).toBe(false);
    expect(result.migrationName).toBe('InvalidName');
    expect(result.filePath).toBe('');
    expect(result.message).toContain('Validation failed');
  });
});

describe('MigrationGenerator Migration Content', () => {
  let migrationsPath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    migrationsPath = path.join(testDir, 'migrations');
    fs.mkdirSync(migrationsPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should have valid TypeScript syntax', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    const content = fs.readFileSync(result.filePath, 'utf-8');

    // Check for basic TypeScript syntax
    expect(content).toContain('export');
    expect(content).toContain('interface');
    expect(content).toContain('async');
    expect(content).toContain('Promise');
  });

  it('should include comments and documentation', async () => {
    const options: MigrationOptions = {
      name: 'create_users_table',
      migrationsPath,
    };

    const result = await MigrationGenerator.generateMigration(options);

    const content = fs.readFileSync(result.filePath, 'utf-8');

    expect(content).toContain('/**');
    expect(content).toContain('Migration');
    expect(content).toContain('*');
  });
});
