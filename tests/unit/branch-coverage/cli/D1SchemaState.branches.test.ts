import { describe, expect, it } from 'vitest';

import { D1SchemaState } from '@/cli/d1/D1SchemaState';

type State = ReturnType<typeof D1SchemaState.create>;

const columnsOf = (state: State, table: string): string[] =>
  (D1SchemaState.introspect(state, `PRAGMA table_info("${table}")`, []) ?? []).map((row) =>
    String(row['name'])
  );

const indexNamesOf = (state: State, table: string): string[] =>
  (D1SchemaState.introspect(state, `PRAGMA index_list("${table}")`, []) ?? []).map((row) =>
    String(row['name'])
  );

const triggerNamesOf = (state: State, names: string[]): string[] =>
  (
    D1SchemaState.introspect(
      state,
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (?)",
      names
    ) ?? []
  ).map((row) => String(row['name']));

const tableNamesOf = (state: State): string[] =>
  (
    D1SchemaState.introspect(
      state,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      []
    ) ?? []
  ).map((row) => String(row['name']));

describe('D1SchemaState uncovered branch coverage', () => {
  it('ignores malformed CREATE statements when identifiers cannot be read', () => {
    const state = D1SchemaState.create();

    for (const sql of [
      'CREATE TABLE',
      'CREATE TABLE ()',
      'CREATE TABLE "t"',
      'CREATE TABLE "t" ("unclosed TEXT)',
      'CREATE VIRTUAL TABLE',
      'CREATE VIRTUAL TABLE ()',
      'CREATE INDEX',
      'CREATE INDEX ()',
      'CREATE UNIQUE INDEX "i"',
      'CREATE INDEX "i" ON ()',
      'CREATE TRIGGER',
      'CREATE TRIGGER ()',
      'CREATE TRIGGER "trg" AFTER INSERT',
      'CREATE TRIGGER "trg" AFTER INSERT ON ()',
      'CREATE TABLE "t" ("a" TEXT)',
    ]) {
      expect(() => D1SchemaState.applyDdl(state, sql)).not.toThrow();
    }

    expect(tableNamesOf(state)).toEqual(['t']);
  });

  it('uses empty column lists when parentheses are missing or unbalanced', () => {
    const state = D1SchemaState.create();

    D1SchemaState.applyDdl(state, 'CREATE TABLE "t"');
    D1SchemaState.applyDdl(state, 'CREATE TABLE "u" ("a" TEXT');
    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE "v"');

    expect(columnsOf(state, 't')).toEqual([]);
    expect(columnsOf(state, 'u')).toEqual([]);
    expect(columnsOf(state, 'v')).toEqual([]);
  });

  it('splits definitions around quoted commas and skips constraints and keyword types', () => {
    const state = D1SchemaState.create();

    D1SchemaState.applyDdl(
      state,
      `CREATE TABLE "t" (
        "id" INTEGER PRIMARY KEY,
        "label" TEXT DEFAULT 'a,b',
        "plain",
        "flag" NOT NULL,
        UNIQUE ("id", "label"),
        CONSTRAINT "chk" CHECK ("id" > 0),
        "json" TEXT DEFAULT "x,y"
      )`
    );

    expect(columnsOf(state, 't')).toEqual(['id', 'label', 'plain', 'flag', 'json']);
    const rows = D1SchemaState.introspect(state, 'PRAGMA table_info("t")', []);
    expect(rows?.map((row) => row['type'])).toEqual([
      'INTEGER',
      'TEXT',
      '',
      '',
      'TEXT',
    ]);
  });

  it('keeps existing IF NOT EXISTS tables, indexes, and triggers', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE TABLE IF NOT EXISTS "t" ("b" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE INDEX "i" ON "t" ("a")');
    D1SchemaState.applyDdl(state, 'CREATE INDEX IF NOT EXISTS "i" ON "t" ("b")');
    D1SchemaState.applyDdl(
      state,
      'CREATE TRIGGER "trg" AFTER INSERT ON "t" BEGIN SELECT 1; END'
    );
    D1SchemaState.applyDdl(
      state,
      'CREATE TRIGGER IF NOT EXISTS "trg" AFTER UPDATE ON "t" BEGIN SELECT 1; END'
    );

    expect(columnsOf(state, 't')).toEqual(['a']);
    expect(indexNamesOf(state, 't')).toEqual(['i']);
    expect(triggerNamesOf(state, ['trg'])).toEqual(['trg']);
  });

  it('models virtual tables whose USING arguments have no parenthesised options', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE "v" USING fts5(a, b)');
    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE "w" USING fts5(a)');
    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE "w" USING fts5(b)');

    expect(columnsOf(state, 'v')).toEqual(['a', 'b']);
    // Without IF NOT EXISTS the second CREATE replaces the first definition.
    expect(columnsOf(state, 'w')).toEqual(['b']);
  });

  it('handles ALTER TABLE edge cases: missing tables, duplicate columns, and renames', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE INDEX "i" ON "t" ("a")');
    D1SchemaState.applyDdl(state, 'CREATE TRIGGER "trg" AFTER INSERT ON "t" BEGIN SELECT 1; END');

    for (const sql of [
      'ALTER VIEW "t" RENAME TO "u"',
      'ALTER TABLE',
      'ALTER TABLE ()',
      'ALTER TABLE "missing" ADD COLUMN "b" TEXT',
      'ALTER TABLE "t" ADD COLUMN "a" INTEGER',
      'ALTER TABLE "missing" DROP COLUMN "a"',
      'ALTER TABLE "t" DROP COLUMN ()',
      'ALTER TABLE "t" RENAME TO ()',
    ]) {
      expect(() => D1SchemaState.applyDdl(state, sql)).not.toThrow();
    }

    D1SchemaState.applyDdl(state, 'ALTER TABLE "t" RENAME TO "renamed"');

    expect(columnsOf(state, 't')).toEqual([]);
    expect(columnsOf(state, 'renamed')).toEqual(['a']);
    expect(indexNamesOf(state, 'renamed')).toEqual(['i']);
    expect(indexNamesOf(state, 't')).toEqual([]);
    expect(triggerNamesOf(state, ['trg'])).toEqual(['trg']);
  });

  it('drops indexes and triggers independently and ignores unknown DDL', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE INDEX "i" ON "t" ("a")');
    D1SchemaState.applyDdl(
      state,
      'CREATE TEMPORARY TRIGGER "trg" AFTER INSERT ON "t" BEGIN SELECT 1; END'
    );

    for (const sql of [
      'DROP VIEW "t"',
      'DROP TABLE',
      'DROP TABLE ()',
      'DROP INDEX IF NOT EXISTS "missing"',
    ]) {
      expect(() => D1SchemaState.applyDdl(state, sql)).not.toThrow();
    }

    D1SchemaState.applyDdl(state, 'DROP INDEX "i"');
    D1SchemaState.applyDdl(state, 'DROP TRIGGER "trg"');

    expect(indexNamesOf(state, 't')).toEqual([]);
    expect(triggerNamesOf(state, ['trg'])).toEqual([]);
  });

  it('covers trailing commas, unmappable virtual arguments, and rename edge cases', () => {
    const state = D1SchemaState.create();

    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT,)');
    expect(columnsOf(state, 't')).toEqual(['a']);

    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE "v" USING fts5(a, ?, b)');
    expect(columnsOf(state, 'v')).toEqual(['a', 'b']);

    D1SchemaState.applyDdl(state, 'CREATE VIRTUAL TABLE IF NOT EXISTS "v" USING fts5(c)');
    expect(columnsOf(state, 'v')).toEqual(['a', 'b']);

    D1SchemaState.applyDdl(state, 'CREATE TABLE "plain" ("id" INTEGER)');
    D1SchemaState.applyDdl(state, 'ALTER TABLE "plain" RENAME TO "renamed_plain"');
    expect(columnsOf(state, 'renamed_plain')).toEqual(['id']);

    D1SchemaState.applyDdl(state, 'ALTER TABLE "missing" RENAME TO "also_missing"');
    expect(tableNamesOf(state)).not.toContain('also_missing');
  });

  it('answers introspection edge cases with empty arrays and modelled table names', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "Users" ("id" INTEGER)');

    expect(D1SchemaState.introspect(state, 'PRAGMA table_info()', [])).toEqual([]);
    expect(D1SchemaState.introspect(state, 'PRAGMA index_list()', [])).toEqual([]);

    const lookup = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?";
    expect(D1SchemaState.introspect(state, lookup, [undefined])).toEqual([]);
    expect(D1SchemaState.introspect(state, lookup, ['users'])).toHaveLength(1);

    expect(tableNamesOf(state)).toEqual(['Users']);
    expect(
      D1SchemaState.introspect(
        state,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        []
      )
    ).toEqual([{ name: 'Users' }]);
  });
});
