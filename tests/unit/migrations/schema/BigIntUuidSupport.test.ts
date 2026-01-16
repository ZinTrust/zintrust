import { describe, expect, it } from 'vitest';

import { MigrationBlueprint } from '@/migrations/schema/Blueprint';
import { MigrationSchemaCompiler } from '@/migrations/schema/SchemaCompiler';

describe('BigIntUuidSupport', () => {
  it('should compile BigInt and UUID for Postgres', () => {
    const table = MigrationBlueprint.create('large_data');

    table.bigInteger('big_id').primary().autoIncrement();
    table.uuid('uid');
    table.blob('data');

    const sql = MigrationSchemaCompiler.compileCreateTable('postgresql', table.getDefinition());
    const stmt = sql[0];

    // Check bigIncrements mapping
    expect(stmt).toContain('"big_id" BIGSERIAL PRIMARY KEY');
    // Check UUID mapping
    expect(stmt).toContain('"uid" UUID');
    // Check BLOB -> BYTEA mapping
    expect(stmt).toContain('"data" BYTEA');
  });

  it('should compile BigInt and UUID for MySQL', () => {
    const table = MigrationBlueprint.create('large_data');

    table.bigInteger('big_id').primary().autoIncrement();
    table.uuid('uid');
    table.blob('data');

    const sql = MigrationSchemaCompiler.compileCreateTable('mysql', table.getDefinition());
    const stmt = sql[0];

    // Check bigIncrements mapping (MySQL uses explicit BIGINT AUTO_INCREMENT)
    expect(stmt).toContain('`big_id` BIGINT AUTO_INCREMENT PRIMARY KEY');
    // Check UUID mapping (VARCHAR 36 fallback)
    expect(stmt).toContain('`uid` VARCHAR(36)');
    // Check BLOB mapping
    expect(stmt).toContain('`data` BLOB');
  });

  it('should compile BigInt and UUID for SQLite', () => {
    const table = MigrationBlueprint.create('large_data');

    table.bigInteger('big_id').primary().autoIncrement();
    table.uuid('uid');

    const sql = MigrationSchemaCompiler.compileCreateTable('sqlite', table.getDefinition());
    const stmt = sql[0];

    // SQLite auto-inc must be INTEGER
    expect(stmt).toContain('"big_id" INTEGER PRIMARY KEY AUTOINCREMENT');
    // UUID -> TEXT
    expect(stmt).toContain('"uid" TEXT');
  });
});
