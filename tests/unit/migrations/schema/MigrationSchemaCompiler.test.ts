import { describe, expect, it } from 'vitest';

import { MigrationBlueprint } from '@/migrations/schema/Blueprint';
import { MigrationSchemaCompiler } from '@/migrations/schema/SchemaCompiler';

describe('MigrationSchemaCompiler', () => {
  it('should compile sqlite create-table with safe defaults', () => {
    const table = MigrationBlueprint.create('users');

    table.id();
    table.string('email').unique();
    table.timestamps();
    table.index('email');

    const sql = MigrationSchemaCompiler.compileCreateTable('sqlite', table.getDefinition());

    expect(sql[0]).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(sql[0]).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(sql[0]).toContain('DEFAULT CURRENT_TIMESTAMP');
    expect(sql.some((s) => s.startsWith('CREATE INDEX'))).toBe(true);
  });

  it('should compile mysql quoting', () => {
    const table = MigrationBlueprint.create('users');

    table.id();
    table.string('name');
    table.date('blocked_date');

    const sql = MigrationSchemaCompiler.compileCreateTable('mysql', table.getDefinition());

    expect(sql[0]).toContain('CREATE TABLE IF NOT EXISTS `users`');
    expect(sql[0]).toContain('`id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY');
    expect(sql[0]).toContain('`blocked_date` DATE NOT NULL');
  });

  it('should compile sqlite date columns as text for portability', () => {
    const table = MigrationBlueprint.create('users');

    table.id();
    table.date('blocked_date').nullable();

    const sql = MigrationSchemaCompiler.compileCreateTable('sqlite', table.getDefinition());

    expect(sql[0]).toContain('"blocked_date" TEXT');
  });

  it('should reject invalid identifiers', () => {
    const table = MigrationBlueprint.create('users');
    table.id();

    expect(() =>
      MigrationSchemaCompiler.compileCreateTable('sqlite', {
        ...table.getDefinition(),
        name: 'bad-name',
      })
    ).toThrow();
  });

  it('should emit CREATE UNIQUE INDEX for composite unique constraints', () => {
    const table = MigrationBlueprint.create('entry_tags');

    table.string('entry_uuid');
    table.string('tag');
    table.unique(['entry_uuid', 'tag']);

    const sql = MigrationSchemaCompiler.compileCreateTable('sqlite', table.getDefinition());

    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uniq_entry_tags_entry_uuid_tag" ON "entry_tags" ("entry_uuid", "tag")'
    );
  });
});
