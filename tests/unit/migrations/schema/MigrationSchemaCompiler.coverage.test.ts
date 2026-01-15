import { describe, expect, it } from 'vitest';

import { MigrationSchemaCompiler } from '@/migrations/schema/SchemaCompiler';
import type {
  ColumnDefinition,
  ForeignKeyDefinition,
  TableDefinition,
} from '@/migrations/schema/types';

const baseColumn = (name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  name,
  type: 'INTEGER',
  nullable: false,
  defaultValue: undefined,
  primary: false,
  unique: false,
  autoIncrement: false,
  unsigned: false,
  ...overrides,
});

describe('MigrationSchemaCompiler (coverage)', () => {
  it('creates a table with composite primary keys and foreign keys', () => {
    const columns: ColumnDefinition[] = [
      baseColumn('tenant_id', { primary: true }),
      baseColumn('user_id', { primary: true }),
      baseColumn('role', { type: 'STRING', defaultValue: 'admin' }),
    ];

    const foreignKeys: ForeignKeyDefinition[] = [
      {
        name: 'fk_user_roles_user',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      },
    ];

    const def: TableDefinition = {
      name: 'user_roles',
      columns,
      indexes: [],
      foreignKeys,
    };

    const sql = MigrationSchemaCompiler.compileCreateTable('postgresql', def, {
      ifNotExists: false,
    });

    expect(sql[0]).toContain('CREATE TABLE "user_roles"');
    expect(sql[0]).toContain('PRIMARY KEY ("tenant_id", "user_id")');
    expect(sql[0]).toContain('CONSTRAINT "fk_user_roles_user"');
    expect(sql[0]).toContain('ON DELETE CASCADE');
    expect(sql[0]).toContain('ON UPDATE RESTRICT');
  });

  it('adds columns, indexes, and foreign keys in alter table plans', () => {
    const plan = {
      addColumns: [baseColumn('note', { type: 'TEXT' })],
      dropColumns: [],
      createIndexes: [{ name: 'idx_users_note', columns: ['note'], type: 'INDEX' }],
      dropIndexes: ['idx_users_old'],
      addForeignKeys: [
        {
          name: 'fk_users_org',
          columns: ['org_id'],
          referencedTable: 'orgs',
          referencedColumns: ['id'],
        },
      ],
      dropForeignKeys: [],
    };

    const statements = MigrationSchemaCompiler.compileAlterTable(
      'postgresql',
      'users',
      plan as any
    );

    const joined = statements.join('\n');
    expect(joined).toContain('ADD COLUMN');
    expect(joined).toContain('CREATE INDEX');
    expect(joined).toContain('DROP INDEX');
    expect(joined).toContain('ADD CONSTRAINT');
  });

  it('creates index statements and drop table with ifExists option', () => {
    const def: TableDefinition = {
      name: 'events',
      columns: [baseColumn('id', { primary: true })],
      indexes: [{ name: 'idx_events_id', columns: ['id'], type: 'INDEX' }],
      foreignKeys: [],
    };

    const sql = MigrationSchemaCompiler.compileCreateTable('mysql', def, { ifNotExists: true });
    expect(sql[0]).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql[1]).toContain('CREATE INDEX');
    expect(sql[1]).toContain('ON `events`');

    const drop = MigrationSchemaCompiler.compileDropTable('mysql', 'events', { ifExists: false });
    expect(drop).toContain('DROP TABLE');
    expect(drop).not.toContain('IF EXISTS');
  });

  it('validates unsupported default types and invalid auto-increment types', () => {
    const badDefault: TableDefinition = {
      name: 'bad_defaults',
      columns: [baseColumn('meta', { type: 'JSON', defaultValue: Symbol('bad') as any })],
      indexes: [],
      foreignKeys: [],
    };

    expect(() => MigrationSchemaCompiler.compileCreateTable('sqlite', badDefault)).toThrow(
      /Unsupported default type/i
    );

    const badAutoIncrement: TableDefinition = {
      name: 'bad_auto',
      columns: [baseColumn('name', { type: 'TEXT', autoIncrement: true })],
      indexes: [],
      foreignKeys: [],
    };

    expect(() => MigrationSchemaCompiler.compileCreateTable('sqlite', badAutoIncrement)).toThrow(
      /Auto-increment column must be INTEGER or BIGINT/i
    );
  });

  it('throws for sqlite alter operations that drop columns or foreign keys', () => {
    const plan = {
      addColumns: [],
      dropColumns: ['old_col'],
      createIndexes: [],
      dropIndexes: [],
      addForeignKeys: [],
      dropForeignKeys: [],
    };

    expect(() => MigrationSchemaCompiler.compileAlterTable('sqlite', 'users', plan as any)).toThrow(
      /SQLite\/D1 does not support dropping columns/i
    );
  });

  it('rejects unsupported drivers and foreign key actions', () => {
    const def: TableDefinition = {
      name: 'users',
      columns: [baseColumn('id', { primary: true })],
      indexes: [],
      foreignKeys: [
        {
          name: 'fk_users_org',
          columns: ['org_id'],
          referencedTable: 'orgs',
          referencedColumns: ['id'],
          onDelete: 'INVALID' as any,
        },
      ],
    };

    expect(() => MigrationSchemaCompiler.compileCreateTable('oracle', def)).toThrow(
      /Unsupported DB driver/i
    );

    expect(() => MigrationSchemaCompiler.compileCreateTable('postgresql', def)).toThrow(
      /Unsupported foreign key action/i
    );
  });

  it('builds foreign key drop statements for mysql and postgres', () => {
    const plan = {
      addColumns: [],
      dropColumns: [],
      createIndexes: [],
      dropIndexes: [],
      addForeignKeys: [],
      dropForeignKeys: ['fk_users_org'],
    };

    const mysqlSql = MigrationSchemaCompiler.compileAlterTable('mysql', 'users', plan as any);
    expect(mysqlSql.join('\n')).toContain('DROP FOREIGN KEY');

    const pgSql = MigrationSchemaCompiler.compileAlterTable('postgresql', 'users', plan as any);
    expect(pgSql.join('\n')).toContain('DROP CONSTRAINT');
  });
});
