import { describe, expect, it } from 'vitest';

import { SQLiteAdapter } from '@zintrust/db-sqlite';

import { SchemaBuilder } from '../../src/schema/SchemaBuilder';
import type { TableSchema } from '../../src/types';

let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

describe('d1-migrator auto-increment primary key preservation', () => {
  it('emits INTEGER PRIMARY KEY AUTOINCREMENT for imported auto-increment ids', () => {
    const schema: TableSchema = {
      name: 'users',
      primaryKey: 'id',
      primaryKeys: ['id'],
      indexes: [],
      foreignKeys: [],
      columns: [
        {
          name: 'id',
          type: 'bigint',
          nullable: false,
          autoIncrement: true,
        },
        {
          name: 'name',
          type: 'varchar',
          nullable: false,
        },
      ],
    };

    const d1Schema = SchemaBuilder.buildD1Schema([schema], 'mysql');
    expect(d1Schema).toHaveLength(1);
    expect(d1Schema[0]?.columns[0]).toMatchObject({
      name: 'id',
      type: 'INTEGER',
      nullable: false,
      autoIncrement: true,
    });

    const createSql = SchemaBuilder.generateCreateTableSQL(d1Schema[0] as TableSchema);
    expect(createSql).toContain('`id` INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(createSql).not.toContain('PRIMARY KEY (id)');
  });

  (HAS_NATIVE_SQLITE ? it : it.skip)(
    'preserves imported ids and keeps idless inserts auto-allocating numeric ids',
    async () => {
      const schema: TableSchema = {
        name: 'users',
        primaryKey: 'id',
        primaryKeys: ['id'],
        indexes: [],
        foreignKeys: [],
        columns: [
          {
            name: 'id',
            type: 'bigint',
            nullable: false,
            autoIncrement: true,
          },
          {
            name: 'name',
            type: 'varchar',
            nullable: false,
          },
        ],
      };

      const d1Table = SchemaBuilder.buildD1Table(schema, 'mysql');
      SchemaBuilder.assertValidSchema([d1Table]);

      const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' });
      await adapter.connect();

      try {
        await adapter.query(SchemaBuilder.generateCreateTableSQL(d1Table), []);
        await adapter.query('INSERT INTO `users` (`id`, `name`) VALUES (?, ?)', [41, 'Imported']);
        await adapter.query('INSERT INTO `users` (`name`) VALUES (?)', ['Generated']);

        const rows = await adapter.query('SELECT id, name FROM `users` ORDER BY id ASC', []);

        expect(rows.rows).toEqual([
          { id: 41, name: 'Imported' },
          { id: 42, name: 'Generated' },
        ]);
      } finally {
        await adapter.disconnect?.();
      }
    }
  );
});
