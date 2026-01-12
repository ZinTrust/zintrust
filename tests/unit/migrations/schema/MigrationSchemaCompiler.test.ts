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

    const sql = MigrationSchemaCompiler.compileCreateTable('mysql', table.getDefinition());

    expect(sql[0]).toContain('CREATE TABLE IF NOT EXISTS `users`');
    expect(sql[0]).toContain('`id` INT AUTO_INCREMENT PRIMARY KEY');
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
});
