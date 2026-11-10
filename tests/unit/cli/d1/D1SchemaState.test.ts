import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { D1SchemaState } from '../../../../src/cli/d1/D1SchemaState';
import { D1SqlMigrations } from '../../../../src/cli/d1/D1SqlMigrations';

const columnNames = (state: ReturnType<typeof D1SchemaState.create>, table: string): string[] =>
  (D1SchemaState.introspect(state, `PRAGMA table_info("${table}")`, []) ?? []).map(
    (row) => row['name'] as string
  );

const indexNames = (state: ReturnType<typeof D1SchemaState.create>, table: string): string[] =>
  (D1SchemaState.introspect(state, `PRAGMA index_list("${table}")`, []) ?? []).map(
    (row) => row['name'] as string
  );

describe('D1SchemaState', () => {
  it('records CREATE TABLE columns and answers table_info in declaration order', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(
      state,
      'CREATE TABLE IF NOT EXISTS "zin_trace_entries" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "uuid" TEXT NOT NULL UNIQUE, "created_at" BIGINT NOT NULL)'
    );

    expect(columnNames(state, 'zin_trace_entries')).toEqual(['id', 'uuid', 'created_at']);
    const rows = D1SchemaState.introspect(state, 'PRAGMA table_info("zin_trace_entries")', []);
    expect(rows?.[1]).toMatchObject({ cid: 1, name: 'uuid', type: 'TEXT' });
  });

  it('keeps an existing table when CREATE TABLE IF NOT EXISTS repeats it', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE TABLE IF NOT EXISTS "t" ("a" TEXT, "b" TEXT)');

    expect(columnNames(state, 't')).toEqual(['a']);
  });

  it('answers sqlite_master table lookups case-insensitively', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "Users" ("id" INTEGER)');
    const lookup = "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1";

    expect(D1SchemaState.introspect(state, lookup, ['users'])).toHaveLength(1);
    expect(D1SchemaState.introspect(state, lookup, ['missing'])).toEqual([]);
  });

  it('applies ALTER TABLE ADD COLUMN and DROP COLUMN to the recorded columns', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("id" INTEGER, "a" TEXT)');
    D1SchemaState.applyDdl(state, 'ALTER TABLE "t" ADD COLUMN "summary" TEXT');
    expect(columnNames(state, 't')).toEqual(['id', 'a', 'summary']);

    D1SchemaState.applyDdl(state, 'ALTER TABLE "t" DROP COLUMN "a"');
    expect(columnNames(state, 't')).toEqual(['id', 'summary']);
  });

  it('records CREATE INDEX for index_list lookups on its table only', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT, "b" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE INDEX "idx_t_a" ON "t" ("a")');

    expect(indexNames(state, 't')).toEqual(['idx_t_a']);
    expect(indexNames(state, 'other')).toEqual([]);
  });

  it('drops indexes and triggers together with their table', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(state, 'CREATE INDEX "idx_t_a" ON "t" ("a")');
    D1SchemaState.applyDdl(state, 'CREATE TRIGGER "trg_t" AFTER INSERT ON "t" BEGIN SELECT 1; END');
    D1SchemaState.applyDdl(state, 'DROP TABLE "t"');

    expect(columnNames(state, 't')).toEqual([]);
    expect(indexNames(state, 't')).toEqual([]);
    expect(
      D1SchemaState.introspect(
        state,
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (?)",
        ['trg_t']
      )
    ).toEqual([]);
  });

  it('answers trigger lookups with only the requested trigger names', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(state, 'CREATE TABLE "t" ("a" TEXT)');
    D1SchemaState.applyDdl(
      state,
      'CREATE TRIGGER IF NOT EXISTS "Trg_A" AFTER INSERT ON "t" BEGIN SELECT 1; END'
    );

    const rows = D1SchemaState.introspect(
      state,
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (?, ?)",
      ['trg_a', 'missing']
    );
    expect(rows).toEqual([{ name: 'Trg_A' }]);
  });

  it('models virtual table columns from the USING arguments and skips options', () => {
    const state = D1SchemaState.create();
    D1SchemaState.applyDdl(
      state,
      "CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(all_content, request, tokenize = 'trigram')"
    );

    expect(columnNames(state, 'search')).toEqual(['all_content', 'request']);
  });

  it('returns null for statements it does not model so they are captured as SQL', () => {
    const state = D1SchemaState.create();

    expect(D1SchemaState.introspect(state, 'SELECT 1', [])).toBeNull();
    expect(D1SchemaState.introspect(state, 'PRAGMA foreign_keys = ON', [])).toBeNull();
  });
});

describe('D1SqlMigrations trace compilation', () => {
  const outputDirs: string[] = [];

  afterEach(() => {
    for (const dir of outputDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('compiles the trace migrations with the index, summary column, search table and triggers', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'zin-d1-trace-'));
    outputDirs.push(outputDir);

    await D1SqlMigrations.compileAndWrite({
      projectRoot: process.cwd(),
      globalDir: path.join(process.cwd(), 'packages', 'trace', 'migrations'),
      extension: 'ts',
      includeGlobal: true,
      outputDir,
    });

    const read = (name: string): string => readFileSync(path.join(outputDir, name), 'utf8');

    expect(read('20260412090000_add_zin_trace_entries_type_created_index.sql')).toContain(
      'CREATE INDEX "idx_zin_trace_type_created_id" ON "zin_trace_entries" ("type", "created_at", "id");'
    );
    expect(read('20260412120000_add_zin_trace_entries_summary_column.sql')).toContain(
      'ALTER TABLE "zin_trace_entries" ADD COLUMN "summary" TEXT;'
    );

    const search = read('20261109120000_add_zin_trace_entries_search_index.sql');
    expect(search).toContain(
      'CREATE VIRTUAL TABLE IF NOT EXISTS zin_trace_entries_search USING fts5('
    );
    expect(search).toContain('CREATE TRIGGER IF NOT EXISTS zin_trace_entries_search_ai');
    expect(search).toContain('CREATE TRIGGER IF NOT EXISTS zin_trace_entries_search_au');
    expect(search).toContain('CREATE TRIGGER IF NOT EXISTS zin_trace_entries_search_ad');
  });
});
