/**
 * Migration: AddZinTraceEntriesSearchIndex
 * Adds a trigram FTS5 index over the searchable JSON fields so dashboard substring searches are
 * answered from the index instead of scanning every entry. SQLite and D1 only; other drivers keep
 * the LIKE scan. Triggers keep the index in sync on insert, content update, and delete.
 */
import { MigrationSchema, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

const TABLE = 'zin_trace_entries';
const SEARCH_TABLE = 'zin_trace_entries_search';
const TRIGGER_INSERT = 'zin_trace_entries_search_ai';
const TRIGGER_UPDATE = 'zin_trace_entries_search_au';
const TRIGGER_DELETE = 'zin_trace_entries_search_ad';
const TRIGGERS = [TRIGGER_INSERT, TRIGGER_UPDATE, TRIGGER_DELETE] as const;

// Must match SEARCH_FIELD_KEYS in packages/trace/src/storage/TraceStorage.ts.
// Migrations compile separately (rootDir ./migrations), so the mapping is repeated here.
const FIELD_KEYS: Record<string, readonly string[]> = {
  request: ['payload', 'requestBody'],
  response: ['responseBody', 'responseStatus'],
  headers: ['headers', 'requestHeaders', 'responseHeaders'],
  url: ['uri', 'url'],
  error: ['error', 'message'],
  sql: ['sql'],
  meta: ['method', 'hostname', 'userId', 'name', 'key', 'model', 'subject', 'command'],
};

const FIELD_COLUMNS = Object.keys(FIELD_KEYS);
const COLUMN_LIST = ['all_content', ...FIELD_COLUMNS].join(', ');

const isSqliteFamilyDriver = (driver: string): boolean =>
  driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';

// Newline separators keep trigrams from spanning two keys; the storage layer never matches terms containing a newline.
const fieldExpr = (contentRef: string, keys: readonly string[]): string =>
  keys
    .map((key) => `COALESCE(json_extract(${contentRef}, '$.${key}'), '')`)
    .join(` || char(10) || `);

const columnValues = (contentRef: string): string =>
  [
    contentRef,
    ...FIELD_COLUMNS.map((field) => fieldExpr(contentRef, FIELD_KEYS[field] ?? [])),
  ].join(', ');

const insertRowSql = (rowRef: string, contentRef: string): string =>
  `INSERT INTO ${SEARCH_TABLE} (rowid, ${COLUMN_LIST}) VALUES (${rowRef}, ${columnValues(contentRef)})`;

const deleteRowSql = (rowRef: string): string =>
  `DELETE FROM ${SEARCH_TABLE} WHERE rowid = ${rowRef}`;

const createTriggers = async (db: IDatabase): Promise<void> => {
  await db.execute(
    `CREATE TRIGGER IF NOT EXISTS ${TRIGGER_INSERT} AFTER INSERT ON ${TABLE} BEGIN ${insertRowSql('new.id', 'new.content')}; END`,
    []
  );
  await db.execute(
    `CREATE TRIGGER IF NOT EXISTS ${TRIGGER_UPDATE} AFTER UPDATE OF content ON ${TABLE} BEGIN ${deleteRowSql('old.id')}; ${insertRowSql('new.id', 'new.content')}; END`,
    []
  );
  await db.execute(
    `CREATE TRIGGER IF NOT EXISTS ${TRIGGER_DELETE} AFTER DELETE ON ${TABLE} BEGIN ${deleteRowSql('old.id')}; END`,
    []
  );
};

const hasAllTriggers = async (db: IDatabase): Promise<boolean> => {
  const placeholders = TRIGGERS.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (${placeholders})`,
    [...TRIGGERS],
    true
  );
  return rows.length === TRIGGERS.length;
};

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    if (!isSqliteFamilyDriver(db.getType())) return;

    const schema = MigrationSchema.create(db);
    if (!(await schema.hasTable(TABLE))) return;
    if ((await schema.hasTable(SEARCH_TABLE)) && (await hasAllTriggers(db))) return;

    // Rebuild incomplete state before ensuring the synchronization triggers exist.
    await db.execute(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_TABLE} USING fts5(${COLUMN_LIST}, tokenize = 'trigram')`,
      []
    );
    await db.execute(`DELETE FROM ${SEARCH_TABLE}`, []);
    await db.execute(
      `INSERT INTO ${SEARCH_TABLE} (rowid, ${COLUMN_LIST}) SELECT id, ${columnValues('content')} FROM ${TABLE}`,
      []
    );
    await createTriggers(db);
  },

  async down(db: IDatabase): Promise<void> {
    if (!isSqliteFamilyDriver(db.getType())) return;

    await db.execute(`DROP TRIGGER IF EXISTS ${TRIGGER_INSERT}`, []);
    await db.execute(`DROP TRIGGER IF EXISTS ${TRIGGER_UPDATE}`, []);
    await db.execute(`DROP TRIGGER IF EXISTS ${TRIGGER_DELETE}`, []);
    await db.execute(`DROP TABLE IF EXISTS ${SEARCH_TABLE}`, []);
  },
};
