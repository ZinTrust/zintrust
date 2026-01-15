import { describe, expect, it } from 'vitest';

import { MigrationBlueprint } from '@/migrations/schema/Blueprint';

describe('MigrationBlueprint (coverage)', () => {
  it('builds column, index, unique, and drop definitions', () => {
    const table = MigrationBlueprint.create('users');

    table.string('email', 120).unique().nullable().default('test@example.com');
    table.integer('age').default(21);
    table.bigInteger('account_id');
    table.boolean('active').default(true);
    table.timestamps();

    table.index(['email', 'account_id']);
    table.unique('email', 'uniq_users_email');

    table.dropColumn('legacy');
    table.dropIndex('idx_users_old');
    table.dropForeign('fk_users_org');

    const def = table.getDefinition();

    expect(def.name).toBe('users');
    expect(def.columns.some((c) => c.name === 'email' && c.unique === true)).toBe(true);
    expect(def.columns.some((c) => c.name === 'account_id' && c.unsigned === true)).toBe(true);
    expect(def.indexes.some((i) => i.name === 'uniq_users_email')).toBe(true);

    expect(table.getDropColumns()).toEqual(['legacy']);
    expect(table.getDropIndexes()).toEqual(['idx_users_old']);
    expect(table.getDropForeignKeys()).toEqual(['fk_users_org']);
  });

  it('finalizes foreign key builders and validates required fields', () => {
    const table = MigrationBlueprint.create('posts');

    table.integer('user_id');
    table
      .foreign('user_id', 'fk_posts_user')
      .references('id')
      .on('users')
      .onDelete('CASCADE')
      .onUpdate('RESTRICT');

    const def = table.getDefinition();

    expect(def.foreignKeys).toHaveLength(1);
    expect(def.foreignKeys[0]).toEqual(
      expect.objectContaining({
        name: 'fk_posts_user',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      })
    );
  });

  it('throws when foreign key referenced table is missing', () => {
    const table = MigrationBlueprint.create('comments');

    const fk = table.foreign('post_id', 'fk_comments_post').references('id');

    expect(() => fk.getDefinition()).toThrow(/Foreign key missing referenced table/i);
  });

  it('throws when foreign key referenced columns are missing', () => {
    const table = MigrationBlueprint.create('comments');

    const fk = table.foreign('post_id', 'fk_comments_post').on('posts');

    expect(() => fk.getDefinition()).toThrow(/Foreign key missing referenced columns/i);
  });

  it('rejects invalid identifiers', () => {
    expect(() => MigrationBlueprint.create('bad-name')).toThrow(/Invalid table identifier/i);
  });
});
