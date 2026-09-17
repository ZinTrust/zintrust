import type { IDatabase } from '@orm/Database';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import type { IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import { afterEach, describe, expect, it } from 'vitest';

const sqliteDb = (dialect = 'sqlite'): IDatabase =>
  ({
    getType: () => dialect,
    query: async () => [],
  }) as unknown as IDatabase;

describe('QueryBuilder FTS5 MATCH', () => {
  it('compiles lowercase match as parameterized MATCH', () => {
    const builder = QueryBuilder.create('message_search_docs').where('body', 'match', 'hello');

    expect(builder.toSQL()).toContain('WHERE "body" MATCH ?');
    expect(builder.getParameters()).toEqual(['hello']);
  });

  it('compiles uppercase MATCH the same way', () => {
    const builder = QueryBuilder.create('message_search_docs').where('body', 'MATCH', 'hello');

    expect(builder.toSQL()).toContain('WHERE "body" MATCH ?');
    expect(builder.getParameters()).toEqual(['hello']);
  });

  it('compiles not match as NOT MATCH', () => {
    const builder = QueryBuilder.create('message_search_docs').where(
      'body',
      'not match',
      'hello'
    );

    expect(builder.toSQL()).toContain('WHERE "body" NOT MATCH ?');
    expect(builder.getParameters()).toEqual(['hello']);
  });

  it('compiles whereMatch and whereNotMatch helpers', () => {
    const match = QueryBuilder.create('message_search_docs').whereMatch(
      'body',
      '"hello" AND "world"'
    );
    expect(match.toSQL()).toContain('WHERE "body" MATCH ?');
    expect(match.getParameters()).toEqual(['"hello" AND "world"']);

    const notMatch = QueryBuilder.create('message_search_docs').whereNotMatch('body', '"hello"');
    expect(notMatch.toSQL()).toContain('WHERE "body" NOT MATCH ?');
    expect(notMatch.getParameters()).toEqual(['"hello"']);
  });

  it('quotes a table-name MATCH identifier', () => {
    const builder = QueryBuilder.create('message_search_docs').where(
      'message_search_docs',
      'match',
      '"hello"'
    );

    expect(builder.toSQL()).toContain('WHERE "message_search_docs" MATCH ?');
    expect(builder.getParameters()).toEqual(['"hello"']);
  });

  it('still rejects unsafe SQL operators', () => {
    expect(() => QueryBuilder.create('docs').where('body', 'drop', 'x')).toThrow(
      /Unsafe SQL operator/i
    );
  });

  it('still rejects unsafe MATCH identifiers', () => {
    expect(() => QueryBuilder.create('docs').where('body; drop', 'match', 'hello')).toThrow(
      /Unsafe SQL identifier/i
    );
  });

  it('requires a string MATCH value', () => {
    expect(() => QueryBuilder.create('docs').where('body', 'match', ['hello'])).toThrow(
      /MATCH operator requires a string value/i
    );
  });

  it.each(['sqlite', 'd1', 'd1-remote'])('compiles MATCH on %s', (dialect) => {
    const builder = QueryBuilder.create('docs', sqliteDb(dialect)).whereMatch('body', 'hello');

    expect(builder.toSQL()).toContain('WHERE "body" MATCH ?');
    expect(builder.getParameters()).toEqual(['hello']);
  });

  it.each(['postgresql', 'mysql', 'sqlserver'])('rejects MATCH on %s', (dialect) => {
    expect(() =>
      QueryBuilder.create('docs', sqliteDb(dialect)).where('body', 'match', 'hello')
    ).toThrow(/MATCH is only supported on sqlite, d1, and d1-remote/i);
  });

  it('compiles MATCH when dialect is unknown', () => {
    const builder = QueryBuilder.create('docs').where('body', 'match', 'hello');

    expect(builder.toSQL()).toContain('WHERE "body" MATCH ?');
    expect(builder.getParameters()).toEqual(['hello']);
  });
});

let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

const asQueryDb = (adapter: IDatabaseAdapter): IDatabase =>
  ({
    getType: () => adapter.getType(),
    query: async (sql: string, parameters?: unknown[]) => {
      const result = await adapter.query(sql, parameters ?? []);
      return result.rows;
    },
    execute: async (sql: string, parameters?: unknown[]) => adapter.query(sql, parameters ?? []),
  }) as unknown as IDatabase;

(HAS_NATIVE_SQLITE ? describe : describe.skip)('QueryBuilder FTS5 MATCH (sqlite)', () => {
  let adapter: IDatabaseAdapter;

  afterEach(async () => {
    if (adapter?.isConnected()) {
      await adapter.disconnect();
    }
  });

  it('uses porter stemming so MATCH finds searching for search', async () => {
    adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' });
    await adapter.connect();
    await adapter.query(`CREATE VIRTUAL TABLE docs USING fts5(body, tokenize='porter')`, []);

    const db = asQueryDb(adapter);
    await QueryBuilder.create('docs', db).insert({ body: 'searching with porter' });

    const hits = await QueryBuilder.create('docs', db).where('body', 'match', 'search').get();
    expect(hits).toHaveLength(1);

    const likeHits = await QueryBuilder.create('docs', db).where('body', 'like', 'search').get();
    expect(likeHits).toHaveLength(0);

    const miss = await QueryBuilder.create('docs', db).whereMatch('body', 'xyzzy').get();
    expect(miss).toHaveLength(0);
  });
});
