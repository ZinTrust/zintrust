import { describe, expect, it } from 'vitest';

import type { ColumnDefinition, IColumn, ISchema } from '@orm/Schema';

const makeColumn = (
  def: Partial<ColumnDefinition> & { name: string; type: ColumnDefinition['type'] }
): IColumn =>
  ({
    getDefinition: () =>
      ({
        name: def.name,
        type: def.type,
        nullable: def.nullable ?? false,
        unique: def.unique ?? false,
        primary: def.primary ?? false,
        index: def.index ?? false,
        autoIncrement: def.autoIncrement,
        unsigned: def.unsigned,
        length: def.length,
        precision: def.precision,
        scale: def.scale,
        default: def.default,
      }) as ColumnDefinition,
  }) as unknown as IColumn;

const makeSchema = (table: string, cols: Array<ReturnType<typeof makeColumn>>): ISchema =>
  ({
    getTable: () => table,
    getColumns: () => new Map(cols.map((c) => [c.getDefinition().name, c])),
  }) as unknown as ISchema;

describe('orm/SchemaCompiler (coverage)', () => {
  it('creates a table for sqlite-ish drivers and uses AUTOINCREMENT PK', async () => {
    const { SchemaCompiler } = await import('../../../src/orm/SchemaCompiler');

    const sqls: string[] = [];
    const db = {
      getType: () => 'sqlite',
      query: async (sql: string) => {
        sqls.push(sql);
        return [];
      },
    } as any;

    const schema = makeSchema('users', [
      makeColumn({ name: 'id', type: 'integer', primary: true, autoIncrement: true }),
      makeColumn({ name: 'email', type: 'string', unique: true, nullable: false, length: 120 }),
      // defaults only support: null | number | boolean | string
      makeColumn({ name: 'meta', type: 'json', nullable: true, default: '{"a":1}' }),
    ]);

    await SchemaCompiler.createTable(db, schema);

    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toContain('CREATE TABLE');
    expect(sqls[0]).toContain('"users"');
    expect(sqls[0]).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(sqls[0]).toContain('"email" TEXT');
    expect(sqls[0]).toContain('UNIQUE');
  });

  it('creates mysql table with backtick quoting + VARCHAR length + boolean default', async () => {
    const { SchemaCompiler } = await import('../../../src/orm/SchemaCompiler');

    const sqls: string[] = [];
    const db = {
      getType: () => 'mysql',
      query: async (sql: string) => {
        sqls.push(sql);
        return [];
      },
    } as any;

    const schema = makeSchema('users', [
      makeColumn({ name: 'id', type: 'bigInteger', primary: true, autoIncrement: true }),
      makeColumn({ name: 'flag', type: 'boolean', default: true }),
      makeColumn({ name: 'email', type: 'string', length: 42 }),
    ]);

    await SchemaCompiler.createTable(db, schema, { ifNotExists: true });

    expect(sqls[0]).toContain('IF NOT EXISTS');
    expect(sqls[0]).toContain('`users`');
    expect(sqls[0]).toContain('`id` BIGINT AUTO_INCREMENT PRIMARY KEY');
    expect(sqls[0]).toContain('`email` VARCHAR(42)');
    expect(sqls[0]).toContain('DEFAULT 1');
  });

  it('throws for invalid identifiers and unsupported default types', async () => {
    const { SchemaCompiler } = await import('../../../src/orm/SchemaCompiler');

    const db = {
      getType: () => 'postgresql',
      query: async () => [],
    } as any;

    const badSchema = makeSchema('bad-table-name', [makeColumn({ name: 'id', type: 'integer' })]);
    await expect(SchemaCompiler.createTable(db, badSchema)).rejects.toThrow();

    const schema = makeSchema('users', [
      makeColumn({ name: 'id', type: 'integer' }),
      makeColumn({ name: 'meta', type: 'json', default: Symbol('x') as any }),
    ]);

    await expect(SchemaCompiler.createTable(db, schema)).rejects.toThrow();
  });

  it('drops table with quoting', async () => {
    const { SchemaCompiler } = await import('../../../src/orm/SchemaCompiler');

    const sqls: string[] = [];
    const db = {
      getType: () => 'postgresql',
      query: async (sql: string) => {
        sqls.push(sql);
        return [];
      },
    } as any;

    await SchemaCompiler.dropTable(db, 'users');
    expect(sqls[0]).toBe('DROP TABLE IF EXISTS "users"');
  });
});
