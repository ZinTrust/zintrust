/**
 * DebuggerStorage — sealed namespace wrapping the D1/SQLite driver.
 * Resolves the correct IDatabase from the app config, then delegates all
 * read/write operations to the debugger storage facade.
 */
import type { IDatabase } from '@zintrust/core';
import type {
  EntryTypeValue,
  IDebuggerEntry,
  IDebuggerStorage,
  QueryEntriesOptions,
} from '../types';
import { familyHash } from '../utils/familyHash';

const TABLE_ENTRIES = 'zin_debugger_entries';
const TABLE_TAGS = 'zin_debugger_entries_tags';
const TABLE_MONITORING = 'zin_debugger_monitoring';

const generateUuid = (): string => crypto.randomUUID();

type EntryRow = {
  id: number;
  uuid: string;
  batch_id: string;
  family_hash: string | null;
  type: string;
  content: string;
  is_latest: number | boolean;
  created_at: number;
};

type TagRow = { entry_uuid: string; tag: string };

const rowToEntry = (row: EntryRow, tags: string[]): IDebuggerEntry => ({
  uuid: row.uuid,
  batchId: row.batch_id,
  familyHash: row.family_hash ?? undefined,
  type: row.type as EntryTypeValue,
  content: JSON.parse(row.content) as unknown,
  tags,
  isLatest: Boolean(row.is_latest),
  createdAt: row.created_at,
});

const insertTags = async (db: IDatabase, uuid: string, tags: string[]): Promise<void> => {
  if (tags.length === 0) return;

  await Promise.all(
    tags.map(async (tag) => {
      await db.execute(`INSERT OR IGNORE INTO ${TABLE_TAGS} (entry_uuid, tag) VALUES (?, ?)`, [
        uuid,
        tag,
      ]);
    })
  );
};

const buildEntryFilters = (
  opts: QueryEntriesOptions
): { joinClause: string; whereClause: string; params: unknown[]; countParams: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.type) {
    conditions.push('e.type = ?');
    params.push(opts.type);
  }
  if (opts.batchId) {
    conditions.push('e.batch_id = ?');
    params.push(opts.batchId);
  }
  if (opts.from) {
    conditions.push('e.created_at >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push('e.created_at <= ?');
    params.push(opts.to);
  }

  let joinClause = '';
  if (opts.tag) {
    joinClause = `INNER JOIN ${TABLE_TAGS} t ON t.entry_uuid = e.uuid AND t.tag = ?`;
    params.unshift(opts.tag);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countParams = opts.tag ? [opts.tag, ...params.slice(1)] : [...params];

  return { joinClause, whereClause, params, countParams };
};

const loadTagsByUuid = async (db: IDatabase, uuids: string[]): Promise<Map<string, string[]>> => {
  const tagsByUuid = new Map<string, string[]>();
  if (uuids.length === 0) return tagsByUuid;

  const tagRows = (await db.query(
    `SELECT entry_uuid, tag FROM ${TABLE_TAGS} WHERE entry_uuid IN (${uuids.map(() => '?').join(',')})`,
    uuids
  )) as TagRow[];

  for (const tagRow of tagRows) {
    const tags = tagsByUuid.get(tagRow.entry_uuid) ?? [];
    tags.push(tagRow.tag);
    tagsByUuid.set(tagRow.entry_uuid, tags);
  }

  return tagsByUuid;
};

// The storage facade intentionally groups related DB operations in one factory.
// eslint-disable-next-line max-lines-per-function
const createStorage = (db: IDatabase): IDebuggerStorage => {
  const writeEntry = async (entry: IDebuggerEntry): Promise<void> => {
    const uuid = entry.uuid || generateUuid();
    await db.execute(
      `INSERT INTO ${TABLE_ENTRIES} (uuid, batch_id, family_hash, type, content, is_latest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        entry.batchId,
        entry.familyHash ?? null,
        entry.type,
        JSON.stringify(entry.content),
        entry.isLatest ? 1 : 0,
        entry.createdAt,
      ]
    );

    await insertTags(db, uuid, entry.tags);
  };

  const updateEntry = async (
    uuid: string,
    patch: Partial<Pick<IDebuggerEntry, 'content' | 'isLatest'>>
  ): Promise<void> => {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.content !== undefined) {
      sets.push('content = ?');
      params.push(JSON.stringify(patch.content));
    }
    if (patch.isLatest !== undefined) {
      sets.push('is_latest = ?');
      params.push(patch.isLatest ? 1 : 0);
    }

    if (sets.length === 0) return;
    params.push(uuid);

    await db.execute(`UPDATE ${TABLE_ENTRIES} SET ${sets.join(', ')} WHERE uuid = ?`, params);
  };

  const markFamilyStale = async (hash: string, exceptUuid: string): Promise<void> => {
    await db.execute(
      `UPDATE ${TABLE_ENTRIES} SET is_latest = 0
       WHERE family_hash = ? AND uuid != ? AND is_latest = 1`,
      [hash, exceptUuid]
    );
  };

  const queryEntries = async (
    opts: QueryEntriesOptions
  ): Promise<{ data: IDebuggerEntry[]; total: number }> => {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 50;
    const offset = (page - 1) * perPage;
    const { joinClause, whereClause, params, countParams } = buildEntryFilters(opts);

    const countResult = (await db.queryOne(
      `SELECT COUNT(*) as cnt FROM ${TABLE_ENTRIES} e ${joinClause} ${whereClause}`,
      countParams
    )) as { cnt: number } | undefined;
    const total = countResult?.cnt ?? 0;

    const rows = (await db.query(
      `SELECT e.id, e.uuid, e.batch_id, e.family_hash, e.type, e.content, e.is_latest, e.created_at
       FROM ${TABLE_ENTRIES} e ${joinClause} ${whereClause}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    )) as EntryRow[];

    const tagsByUuid = await loadTagsByUuid(
      db,
      rows.map((row) => row.uuid)
    );

    return {
      data: rows.map((row) => rowToEntry(row, tagsByUuid.get(row.uuid) ?? [])),
      total,
    };
  };

  const getEntry = async (uuid: string): Promise<IDebuggerEntry | null> => {
    const row = (await db.queryOne(
      `SELECT id, uuid, batch_id, family_hash, type, content, is_latest, created_at
       FROM ${TABLE_ENTRIES}
       WHERE uuid = ?`,
      [uuid]
    )) as EntryRow | undefined;
    if (!row) return null;

    const tags = (await db.query(`SELECT tag FROM ${TABLE_TAGS} WHERE entry_uuid = ?`, [
      uuid,
    ])) as Array<{
      tag: string;
    }>;
    return rowToEntry(
      row,
      tags.map((tag) => tag.tag)
    );
  };

  const getBatch = async (batchId: string): Promise<IDebuggerEntry[]> => {
    const rows = (await db.query(
      `SELECT id, uuid, batch_id, family_hash, type, content, is_latest, created_at
       FROM ${TABLE_ENTRIES}
       WHERE batch_id = ?
       ORDER BY created_at ASC, id ASC`,
      [batchId]
    )) as EntryRow[];
    if (rows.length === 0) return [];

    const tagsByUuid = await loadTagsByUuid(
      db,
      rows.map((row) => row.uuid)
    );

    return rows.map((row) => rowToEntry(row, tagsByUuid.get(row.uuid) ?? []));
  };

  const prune = async (olderThanMs: number, keepExceptions = false): Promise<number> => {
    const countResult = (await db.queryOne(
      `SELECT COUNT(*) as cnt FROM ${TABLE_ENTRIES}
       WHERE created_at < ?
       ${keepExceptions ? "AND type != 'exception'" : ''}`,
      [olderThanMs]
    )) as { cnt: number } | undefined;
    const deleted = countResult?.cnt ?? 0;
    if (deleted === 0) return 0;

    await db.execute(
      `DELETE FROM ${TABLE_ENTRIES}
       WHERE created_at < ?
       ${keepExceptions ? "AND type != 'exception'" : ''}`,
      [olderThanMs]
    );

    return deleted;
  };

  const clear = async (): Promise<void> => {
    await db.execute(`DELETE FROM ${TABLE_ENTRIES}`, []);
  };

  const getMonitoring = async (): Promise<string[]> => {
    const rows = (await db.query(`SELECT tag FROM ${TABLE_MONITORING}`, [])) as Array<{
      tag: string;
    }>;
    return rows.map((row) => row.tag);
  };

  const addMonitoring = async (tag: string): Promise<void> => {
    await db.execute(`INSERT OR IGNORE INTO ${TABLE_MONITORING} (tag) VALUES (?)`, [tag]);
  };

  const removeMonitoring = async (tag: string): Promise<void> => {
    await db.execute(`DELETE FROM ${TABLE_MONITORING} WHERE tag = ?`, [tag]);
  };

  const stats = async (): Promise<Record<EntryTypeValue, number>> => {
    const rows = (await db.query(
      `SELECT type, COUNT(*) as cnt FROM ${TABLE_ENTRIES} GROUP BY type`,
      []
    )) as Array<{ type: string; cnt: number }>;
    const output: Record<string, number> = {};
    for (const row of rows) {
      output[row.type] = row.cnt;
    }
    return output as Record<EntryTypeValue, number>;
  };

  return {
    writeEntry,
    updateEntry,
    markFamilyStale,
    queryEntries,
    getEntry,
    getBatch,
    prune,
    clear,
    getMonitoring,
    addMonitoring,
    removeMonitoring,
    stats,
  };
};

const resolveStorage = (db: IDatabase): IDebuggerStorage => {
  return createStorage(db);
};

const reset = (): void => {
  return;
};

export const DebuggerStorage = Object.freeze({ resolveStorage, reset, familyHash });

export { type IDebuggerStorage } from '../types';
