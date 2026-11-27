/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { describe, expect, it } from 'vitest';

import type { ColumnDefinition, IColumn, ISchema } from '@orm/Schema';
import { SchemaCompiler } from '@orm/SchemaCompiler';

const col = (
  def: Partial<ColumnDefinition> & { name: string; type: ColumnDefinition['type'] }
): IColumn =>
  ({
    getDefinition: () => ({ nullable: false, unique: false, primary: false, ...def }),
  }) as unknown as IColumn;

const schema = (table: string, columns: IColumn[]): ISchema =>
  ({
    getTable: () => table,
    getColumns: () => new Map(columns.map((c) => [c.getDefinition().name, c])),
  }) as unknown as ISchema;

const compile = async (
  driver: string,
  columns: IColumn[],
  opts?: { ifNotExists?: boolean },
  table = 'users'
): Promise<string> => {
  let sql = '';
  const db = {
    getType: () => driver,
    query: async (statement: string) => {
      sql = statement;
      return [];
    },
  } as any;
  await SchemaCompiler.createTable(db, schema(table, columns), opts);
  return sql;
};

const sqlFor = async (driver: string, def: Partial<ColumnDefinition> & { name: string; type: ColumnDefinition['type'] }) =>
  compile(driver, [col(def)]);

describe('SchemaCompiler uncovered branches', () => {
  it.each(['sqlite', 'd1', 'd1-remote'])(
    '%s: integer primary key uses AUTOINCREMENT',
    async (driver) => {
      expect(await sqlFor(driver, { name: 'id', type: 'integer', primary: true, autoIncrement: true })).toContain(
        '"id" INTEGER PRIMARY KEY AUTOINCREMENT'
      );
    }
  );

  it('postgresql: bigInteger and regular auto-increment keys', async () => {
    expect(
      await sqlFor('postgresql', { name: 'id', type: 'bigInteger', primary: true, autoIncrement: true })
    ).toContain('"id" BIGSERIAL PRIMARY KEY');
    expect(
      await sqlFor('postgresql', { name: 'id', type: 'integer', primary: true, autoIncrement: true })
    ).toContain('"id" SERIAL PRIMARY KEY');
  });

  it('mysql: bigInteger and regular auto-increment keys', async () => {
    expect(
      await sqlFor('mysql', { name: 'id', type: 'bigInteger', primary: true, autoIncrement: true })
    ).toContain('`id` BIGINT AUTO_INCREMENT PRIMARY KEY');
    expect(
      await sqlFor('mysql', { name: 'id', type: 'integer', primary: true, autoIncrement: true })
    ).toContain('`id` INT AUTO_INCREMENT PRIMARY KEY');
  });

  it('auto-increment on unsupported driver falls through to normal column sql', async () => {
    expect(
      await sqlFor('other', { name: 'id', type: 'integer', primary: true, autoIncrement: true })
    ).toContain('"id" INTEGER NOT NULL PRIMARY KEY');
  });

  it.each(['string', 'char'])('string length: finite, non-finite and default', async (type) => {
    expect(await sqlFor('mysql', { name: 'name', type: type as any, length: 88 })).toContain(
      'VARCHAR(88)'
    );
    expect(await sqlFor('mysql', { name: 'name', type: type as any, length: Number.POSITIVE_INFINITY })).toContain(
      'VARCHAR(255)'
    );
    expect(await sqlFor('sqlite', { name: 'name', type: type as any, length: 12 })).toContain(
      '"name" TEXT'
    );
  });

  it('decimal precision and scale default to 10,2', async () => {
    expect(await sqlFor('mysql', { name: 'amount', type: 'decimal' })).toContain(
      'DECIMAL(10,2)'
    );
    expect(
      await sqlFor('mysql', { name: 'amount', type: 'decimal', precision: 6, scale: 3 })
    ).toContain('DECIMAL(6,3)');
  });

  it.each([
    ['mysql', 'DATETIME'],
    ['postgresql', 'TIMESTAMP'],
    ['sqlite', 'TEXT'],
  ])('%s: datetime/timestamp mapping', async (driver, expected) => {
    expect(await sqlFor(driver, { name: 'created_at', type: 'datetime' })).toContain(expected);
    expect(await sqlFor(driver, { name: 'updated_at', type: 'timestamp' })).toContain(expected);
  });

  it('integer types map by family and driver', async () => {
    for (const type of ['smallInteger', 'tinyInteger', 'mediumInteger'] as const) {
      expect(await sqlFor('mysql', { name: 'n', type })).toContain('`n` INT');
      expect(await sqlFor('sqlite', { name: 'n', type })).toContain('"n" INTEGER');
    }
    expect(await sqlFor('mysql', { name: 'n', type: 'bigInteger' })).toContain('`n` BIGINT');
    expect(await sqlFor('other', { name: 'n', type: 'bigInteger' })).toContain('"n" BIGINT');
  });

  it('special types map by driver and fall through to TEXT', async () => {
    expect(await sqlFor('mysql', { name: 'flag', type: 'boolean' })).toContain('TINYINT(1)');
    expect(await sqlFor('sqlite', { name: 'flag', type: 'boolean' })).toContain('BOOLEAN');
    expect(await sqlFor('postgresql', { name: 'doc', type: 'json' })).toContain('JSONB');
    expect(await sqlFor('mysql', { name: 'doc', type: 'json' })).toContain('TEXT');
    expect(await sqlFor('postgresql', { name: 'id', type: 'uuid' })).toContain('UUID');
    expect(await sqlFor('mysql', { name: 'id', type: 'uuid' })).toContain('TEXT');
    expect(await sqlFor('mysql', { name: 'x', type: 'text' })).toContain('TEXT');
  });

  it('defaults: null, finite number, booleans and escaped strings', async () => {
    expect(await sqlFor('mysql', { name: 'n', type: 'integer', default: null })).toContain(
      'DEFAULT NULL'
    );
    expect(await sqlFor('mysql', { name: 'n', type: 'integer', default: 7 })).toContain(
      'DEFAULT 7'
    );
    expect(await sqlFor('postgresql', { name: 'b', type: 'boolean', default: true })).toContain(
      'DEFAULT true'
    );
    expect(await sqlFor('postgresql', { name: 'b', type: 'boolean', default: false })).toContain(
      'DEFAULT false'
    );
    expect(await sqlFor('mysql', { name: 'b', type: 'boolean', default: true })).toContain(
      'DEFAULT 1'
    );
    expect(await sqlFor('mysql', { name: 'b', type: 'boolean', default: false })).toContain(
      'DEFAULT 0'
    );
    expect(await sqlFor('mysql', { name: 's', type: 'string', default: "it's" })).toContain(
      "DEFAULT 'it''s'"
    );
  });

  it('unsupported default value throws a validation error', async () => {
    await expect(
      sqlFor('mysql', { name: 'obj', type: 'json', default: {} as any })
    ).rejects.toThrow(/Unsupported default type/);
  });

  it('column flags: nullable, unique, primary and auto-increment without primary', async () => {
    expect(await sqlFor('mysql', { name: 'n', type: 'integer', nullable: true })).not.toContain(
      'NOT NULL'
    );
    expect(await sqlFor('mysql', { name: 'n', type: 'integer', unique: true })).toContain('UNIQUE');
    expect(await sqlFor('mysql', { name: 'n', type: 'integer', primary: true })).toContain(
      'PRIMARY KEY'
    );
    expect(
      await sqlFor('mysql', { name: 'n', type: 'integer', autoIncrement: true })
    ).not.toContain('AUTO_INCREMENT');
  });

  it('ifNotExists false omits the clause and empty tables are rejected', async () => {
    expect(await compile('sqlite', [col({ name: 'id', type: 'integer' })], { ifNotExists: false })).not.toContain(
      'IF NOT EXISTS'
    );
    await expect(compile('sqlite', [])).rejects.toThrow(/has no columns/);
  });

  it('invalid identifiers are rejected for table, column and drop table', async () => {
    await expect(compile('sqlite', [col({ name: 'bad-name', type: 'integer' })])).rejects.toThrow(
      /Invalid column identifier/
    );
    await expect(
      compile('sqlite', [col({ name: 'id', type: 'integer' })], undefined, 'bad-name')
    ).rejects.toThrow(/Invalid table identifier/);

    const db = { getType: () => 'mysql', query: async () => [] } as any;
    await expect(SchemaCompiler.dropTable(db, 'bad-name')).rejects.toThrow(
      /Invalid table identifier/
    );
    await expect(SchemaCompiler.dropTable(db, 'items')).resolves.toBeUndefined();
  });
});
