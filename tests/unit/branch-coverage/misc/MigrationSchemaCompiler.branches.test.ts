import { describe, expect, it } from 'vitest';

import type {
  ColumnDefinition,
  IndexDefinition,
  TableDefinition,
} from '@migrations/schema/types';
import { MigrationSchemaCompiler } from '@migrations/schema/SchemaCompiler';

const col = (def: Partial<ColumnDefinition> & Pick<ColumnDefinition, 'name' | 'type'>): ColumnDefinition => ({
  nullable: false,
  primary: false,
  unique: false,
  autoIncrement: false,
  unsigned: false,
  ...def,
});

const table = (
  name: string,
  columns: ColumnDefinition[],
  indexes: IndexDefinition[] = [],
  foreignKeys: TableDefinition['foreignKeys'] = []
): TableDefinition => ({ name, columns, indexes, foreignKeys });

const create = (driver: string, columns: ColumnDefinition[], opts?: { ifNotExists?: boolean }) =>
  MigrationSchemaCompiler.compileCreateTable(driver, table('items', columns), opts)[0];

describe('MigrationSchemaCompiler uncovered branches', () => {
  it('rejects unsupported drivers', () => {
    expect(() => MigrationSchemaCompiler.compileDropTable('oracle', 'items')).toThrow(
      /Unsupported DB driver/
    );
    expect(() => MigrationSchemaCompiler.compileCreateTable('oracle', table('items', [col({ name: 'id', type: 'INTEGER' })]))).toThrow(
      /Unsupported DB driver/
    );
    expect(() => MigrationSchemaCompiler.compileAlterTable('oracle', 'items', {
      addColumns: [], dropColumns: [], createIndexes: [], dropIndexes: [],
      addForeignKeys: [], dropForeignKeys: [],
    })).toThrow(/Unsupported DB driver/);
  });

  it('type SQL variants: UUID, REAL, BOOLEAN, JSON, TIMESTAMP, BLOB', () => {
    expect(create('postgresql', [col({ name: 'id', type: 'UUID' })])).toContain('"id" UUID');
    expect(create('mysql', [col({ name: 'id', type: 'UUID' })])).toContain('`id` VARCHAR(36)');
    expect(create('sqlite', [col({ name: 'id', type: 'UUID' })])).toContain('"id" TEXT');
    expect(create('sqlserver', [col({ name: 'n', type: 'REAL' })])).toContain('FLOAT');
    expect(create('mysql', [col({ name: 'n', type: 'REAL' })])).toContain('REAL');
    expect(create('mysql', [col({ name: 'flag', type: 'BOOLEAN' })])).toContain('TINYINT(1)');
    expect(create('postgresql', [col({ name: 'flag', type: 'BOOLEAN' })])).toContain('BOOLEAN');
    expect(create('postgresql', [col({ name: 'doc', type: 'JSON' })])).toContain('JSONB');
    expect(create('mysql', [col({ name: 'doc', type: 'JSON' })])).toContain('JSON');
    expect(create('sqlite', [col({ name: 'doc', type: 'JSON' })])).toContain('TEXT');
    expect(create('mysql', [col({ name: 'at', type: 'TIMESTAMP' })])).toContain('DATETIME');
    expect(create('postgresql', [col({ name: 'at', type: 'TIMESTAMP' })])).toContain('TIMESTAMP');
    expect(create('sqlite', [col({ name: 'at', type: 'TIMESTAMP' })])).toContain('TEXT');
    expect(create('postgresql', [col({ name: 'blob', type: 'BLOB' })])).toContain('BYTEA');
    expect(create('mysql', [col({ name: 'blob', type: 'BLOB' })])).toContain('BLOB');
  });

  it('STRING length fallback and INTEGER/BIGINT mapping', () => {
    expect(create('mysql', [col({ name: 's', type: 'STRING', length: 44 })])).toContain('VARCHAR(44)');
    expect(create('mysql', [col({ name: 's', type: 'STRING', length: Number.NaN })])).toContain('VARCHAR(255)');
    expect(create('mysql', [col({ name: 'n', type: 'INTEGER' })])).toContain('INT');
    expect(create('postgresql', [col({ name: 'n', type: 'INTEGER' })])).toContain('INTEGER');
  });

  it('auto-increment variants for postgres, mysql and sqlserver', () => {
    expect(create('postgresql', [col({ name: 'id', type: 'BIGINT', autoIncrement: true })])).toContain('BIGSERIAL');
    expect(create('postgresql', [col({ name: 'id', type: 'INTEGER', autoIncrement: true })])).toContain('SERIAL');
    expect(create('mysql', [col({ name: 'id', type: 'BIGINT', autoIncrement: true, unsigned: true })])).toContain('BIGINT UNSIGNED AUTO_INCREMENT');
    expect(create('mysql', [col({ name: 'id', type: 'INTEGER', autoIncrement: true })])).toContain('INT AUTO_INCREMENT');
    expect(create('sqlserver', [col({ name: 'id', type: 'BIGINT', autoIncrement: true })])).toContain('IDENTITY(1,1)');
    expect(create('sqlserver', [col({ name: 'id', type: 'INTEGER', autoIncrement: true })])).toContain('INT IDENTITY(1,1)');
    expect(() => create('mysql', [col({ name: 'id', type: 'STRING', autoIncrement: true })])).toThrow(
      /must be INTEGER or BIGINT/
    );
  });

  it('default values: null, finite number, booleans, CURRENT_TIMESTAMP, escaped string, invalid', () => {
    expect(create('mysql', [col({ name: 'n', type: 'INTEGER', defaultValue: null })])).toContain('DEFAULT NULL');
    expect(create('mysql', [col({ name: 'n', type: 'INTEGER', defaultValue: 5 })])).toContain('DEFAULT 5');
    expect(create('postgresql', [col({ name: 'b', type: 'BOOLEAN', defaultValue: true })])).toContain('DEFAULT true');
    expect(create('postgresql', [col({ name: 'b', type: 'BOOLEAN', defaultValue: false })])).toContain('DEFAULT false');
    expect(create('mysql', [col({ name: 'b', type: 'BOOLEAN', defaultValue: true })])).toContain('DEFAULT 1');
    expect(create('mysql', [col({ name: 'b', type: 'BOOLEAN', defaultValue: false })])).toContain('DEFAULT 0');
    expect(create('mysql', [col({ name: 'at', type: 'TIMESTAMP', defaultValue: 'CURRENT_TIMESTAMP' })])).toContain('DEFAULT CURRENT_TIMESTAMP');
    expect(create('mysql', [col({ name: 's', type: 'STRING', defaultValue: "it's" })])).toContain("DEFAULT 'it''s'");
    expect(() => create('mysql', [col({ name: 'x', type: 'JSON', defaultValue: {} })])).toThrow(
      /Unsupported default type/
    );
  });

  it('unsigned only applies to mysql numeric columns', () => {
    expect(create('mysql', [col({ name: 'n', type: 'INTEGER', unsigned: true })])).toContain('UNSIGNED');
    expect(create('mysql', [col({ name: 'n', type: 'BIGINT', unsigned: true })])).toContain('UNSIGNED');
    expect(create('mysql', [col({ name: 'n', type: 'STRING', unsigned: true })])).not.toContain('UNSIGNED');
    expect(create('postgresql', [col({ name: 'n', type: 'INTEGER', unsigned: true })])).not.toContain('UNSIGNED');
  });

  it('constraints and indexes: composite primary key, unique index, foreign keys, drop index variants', () => {
    const statements = MigrationSchemaCompiler.compileCreateTable(
      'mysql',
      table(
        'items',
        [
          col({ name: 'a', type: 'INTEGER', primary: true }),
          col({ name: 'b', type: 'INTEGER', primary: true, unique: true, nullable: true }),
        ],
        [{ name: 'idx_a', columns: ['a'], type: 'INDEX' }, { name: 'uq_b', columns: ['b'], type: 'UNIQUE' }],
        [{
          name: 'fk_a',
          columns: ['a'],
          referencedTable: 'parents',
          referencedColumns: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'SET NULL',
        }]
      )
    );
    expect(statements.join(' ')).toContain('PRIMARY KEY (`a`, `b`)');
    expect(statements.join(' ')).toContain('CONSTRAINT `fk_a` FOREIGN KEY (`a`) REFERENCES `parents` (`id`)');
    expect(statements.join(' ')).toContain('ON DELETE CASCADE');
    expect(statements.join(' ')).toContain('ON UPDATE SET NULL');
    expect(statements.join(' ')).toContain('CREATE UNIQUE INDEX `uq_b`');

    expect(MigrationSchemaCompiler.compileAlterTable('mysql', 'items', {
      addColumns: [], dropColumns: [],
      createIndexes: [],
      dropIndexes: ['old_idx'],
      addForeignKeys: [], dropForeignKeys: [],
    })[0]).toContain('DROP INDEX `old_idx` ON `items`');
    expect(MigrationSchemaCompiler.compileAlterTable('sqlite', 'items', {
      addColumns: [], dropColumns: [],
      createIndexes: [],
      dropIndexes: ['old_idx'],
      addForeignKeys: [], dropForeignKeys: [],
    })[0]).toContain('DROP INDEX IF EXISTS "old_idx"');
  });

  it('drop table ifExists toggle and invalid identifiers', () => {
    expect(MigrationSchemaCompiler.compileDropTable('mysql', 'items')).toContain('IF EXISTS');
    expect(MigrationSchemaCompiler.compileDropTable('mysql', 'items', { ifExists: false })).not.toContain('IF EXISTS');
    expect(() => MigrationSchemaCompiler.compileDropTable('mysql', 'bad-name')).toThrow(/Invalid table identifier/);
    expect(() => create('mysql', [col({ name: 'bad-name', type: 'INTEGER' })])).toThrow(/Invalid column identifier/);
    expect(() => MigrationSchemaCompiler.compileCreateTable('mysql', table('items', []))).toThrow(/has no columns/);
  });

  it('alter table: advanced ops for sqlite, drop columns, add/drop foreign keys', () => {
    const base = { addColumns: [], createIndexes: [], dropIndexes: [] } as const;
    expect(() => MigrationSchemaCompiler.compileAlterTable('sqlite', 'items', {
      ...base, dropColumns: ['old'], addForeignKeys: [], dropForeignKeys: [],
    })).toThrow(/table rebuild required/);

    expect(MigrationSchemaCompiler.compileAlterTable('mysql', 'items', {
      ...base, dropColumns: ['old'], addForeignKeys: [], dropForeignKeys: [],
    })[0]).toContain('DROP COLUMN `old`');

    const fk = {
      name: 'fk_x', columns: ['a'], referencedTable: 'parents', referencedColumns: ['id'],
      onDelete: 'RESTRICT' as const,
    };
    expect(MigrationSchemaCompiler.compileAlterTable('postgresql', 'items', {
      ...base, dropColumns: [], addForeignKeys: [fk], dropForeignKeys: [],
    })[0]).toContain('ADD CONSTRAINT "fk_x"');
    expect(MigrationSchemaCompiler.compileAlterTable('mysql', 'items', {
      ...base, dropColumns: [], addForeignKeys: [], dropForeignKeys: ['fk_x'],
    })[0]).toContain('DROP FOREIGN KEY `fk_x`');
    expect(MigrationSchemaCompiler.compileAlterTable('postgresql', 'items', {
      ...base, dropColumns: [], addForeignKeys: [], dropForeignKeys: ['fk_x'],
    })[0]).toContain('DROP CONSTRAINT "fk_x"');
  });

  it('invalid foreign key action is rejected', () => {
    expect(() => MigrationSchemaCompiler.compileCreateTable('mysql', table('items', [
      col({ name: 'id', type: 'INTEGER' }),
    ], [], [{
      name: 'fk_x', columns: ['id'], referencedTable: 'parents', referencedColumns: ['id'],
      onDelete: 'NOPE' as any,
    }]))).toThrow(/Unsupported foreign key action/);
  });
});
