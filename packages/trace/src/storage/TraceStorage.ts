/**
 * TraceStorage — sealed namespace wrapping the D1/SQLite driver.
 * Resolves the correct IDatabase from the app config, then delegates all
 * read/write operations to the trace storage facade.
 */
import type { IDatabase } from '@zintrust/core';
import type {
  EntryTypeValue,
  ITraceEntry,
  ITraceStorage,
  QueryBatchEntriesOptions,
  QueryBatchEntriesResult,
  QueryEntriesOptions,
} from '../types';
import { familyHash } from '../utils/familyHash';

const TABLE_ENTRIES = 'zin_trace_entries';
const TABLE_TAGS = 'zin_trace_entries_tags';
const TABLE_MONITORING = 'zin_trace_monitoring';

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

const decodeJsonStringLiteral = (value: string): string | undefined => {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return undefined;
  }
};

const matchJsonStringField = (content: string, key: string): string | undefined => {
  const match = new RegExp(String.raw`"${key}"\s*:\s*"((?:\\.|[^"\\])*)"`, 's').exec(content);
  return match ? decodeJsonStringLiteral(match[1]) : undefined;
};

const matchJsonNumberField = (content: string, key: string): number | undefined => {
  const match = new RegExp(String.raw`"${key}"\s*:\s*(-?\d+(?:\.\d+)?)`, 's').exec(content);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const matchJsonNullOrNumberField = (content: string, key: string): number | null | undefined => {
  const nullMatch = new RegExp(String.raw`"${key}"\s*:\s*null`, 's').exec(content);
  if (nullMatch) return null;
  return matchJsonNumberField(content, key);
};

const matchJsonStringArrayField = (content: string, key: string): string[] | undefined => {
  const match = new RegExp(String.raw`"${key}"\s*:\s*(\[.*?\])`, 's').exec(content);
  if (!match) return undefined;

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : undefined;
  } catch {
    return undefined;
  }
};

const compactRequestContent = (content: string): Record<string, unknown> | undefined => {
  const compact: Record<string, unknown> = {};
  const method = matchJsonStringField(content, 'method');
  const uri = matchJsonStringField(content, 'uri');
  const responseStatus = matchJsonNumberField(content, 'responseStatus');
  const duration = matchJsonNumberField(content, 'duration');
  const memory = matchJsonNullOrNumberField(content, 'memory');
  const middleware = matchJsonStringArrayField(content, 'middleware');
  const hostname = matchJsonStringField(content, 'hostname');
  const userId = matchJsonStringField(content, 'userId');

  if (method !== undefined) compact['method'] = method;
  if (uri !== undefined) compact['uri'] = uri;
  if (responseStatus !== undefined) compact['responseStatus'] = responseStatus;
  if (duration !== undefined) compact['duration'] = duration;
  if (memory !== undefined) compact['memory'] = memory;
  if (middleware !== undefined) compact['middleware'] = middleware;
  if (hostname !== undefined) compact['hostname'] = hostname;
  if (userId !== undefined) compact['userId'] = userId;

  return Object.keys(compact).length > 0 ? compact : undefined;
};

const compactClientRequestContent = (content: string): Record<string, unknown> | undefined => {
  const compact: Record<string, unknown> = {};
  const source = matchJsonStringField(content, 'source');
  const method = matchJsonStringField(content, 'method');
  const url = matchJsonStringField(content, 'url');
  const responseStatus = matchJsonNumberField(content, 'responseStatus');
  const error = matchJsonStringField(content, 'error');
  const duration = matchJsonNumberField(content, 'duration');
  const hostname = matchJsonStringField(content, 'hostname');

  if (source !== undefined) compact['source'] = source;
  if (method !== undefined) compact['method'] = method;
  if (url !== undefined) compact['url'] = url;
  if (responseStatus !== undefined) compact['responseStatus'] = responseStatus;
  if (error !== undefined) compact['error'] = error;
  if (duration !== undefined) compact['duration'] = duration;
  if (hostname !== undefined) compact['hostname'] = hostname;

  return Object.keys(compact).length > 0 ? compact : undefined;
};

const summarizeEntryContent = (row: EntryRow): unknown => {
  if (row.type === 'request') {
    return compactRequestContent(row.content) ?? (JSON.parse(row.content) as unknown);
  }

  if (row.type === 'client_request') {
    return compactClientRequestContent(row.content) ?? (JSON.parse(row.content) as unknown);
  }

  return JSON.parse(row.content) as unknown;
};

type DatabaseWithDriver = IDatabase & {
  getType?: () => string;
};

const buildIgnoreInsert = (
  db: IDatabase,
  table: string,
  columns: string[],
  conflictColumns: string[]
): string => {
  const columnList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const driver = (db as DatabaseWithDriver).getType?.() ?? 'sqlite';

  if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') {
    return `INSERT OR IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
  }

  if (driver === 'mysql') {
    return `INSERT IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
  }

  if (driver === 'postgresql') {
    return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`;
  }

  if (driver === 'sqlserver') {
    const sourceColumns = columns.map((_, index) => `v${index + 1}`);
    const selectClause = sourceColumns.map((name) => `? AS ${name}`).join(', ');
    const conflictClause = conflictColumns
      .map((column) => `target.${column} = source.${column}`)
      .join(' AND ');
    const insertValues = columns.map((column) => `source.${column}`).join(', ');
    const sourceProjection = columns
      .map((column, index) => `${sourceColumns[index]} AS ${column}`)
      .join(', ');

    return [
      `MERGE INTO ${table} WITH (HOLDLOCK) AS target`,
      `USING (SELECT ${sourceProjection} FROM (SELECT ${selectClause}) seed) AS source`,
      `ON ${conflictClause}`,
      `WHEN NOT MATCHED THEN INSERT (${columnList}) VALUES (${insertValues});`,
    ].join(' ');
  }

  return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;
};

const rowToEntry = (row: EntryRow, tags: string[], summary = false): ITraceEntry => ({
  uuid: row.uuid,
  batchId: row.batch_id,
  familyHash: row.family_hash ?? undefined,
  type: row.type as EntryTypeValue,
  content: summary ? summarizeEntryContent(row) : (JSON.parse(row.content) as unknown),
  tags,
  isLatest: Boolean(row.is_latest),
  createdAt: row.created_at,
});

const insertTags = async (db: IDatabase, uuid: string, tags: string[]): Promise<void> => {
  if (tags.length === 0) return;

  const sql = buildIgnoreInsert(db, TABLE_TAGS, ['entry_uuid', 'tag'], ['entry_uuid', 'tag']);

  await Promise.all(
    tags.map(async (tag) => {
      await db.execute(sql, [uuid, tag]);
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

const buildBatchCounts = async (
  db: IDatabase,
  batchId: string
): Promise<Partial<Record<EntryTypeValue, number>>> => {
  const rows = (await db.query(
    `SELECT type, COUNT(*) as cnt FROM ${TABLE_ENTRIES} WHERE batch_id = ? GROUP BY type`,
    [batchId]
  )) as Array<{ type: string; cnt: number }>;

  const counts: Partial<Record<EntryTypeValue, number>> = {};
  for (const row of rows) {
    counts[row.type as EntryTypeValue] = row.cnt;
  }

  return counts;
};

const buildBatchEntryFilters = (
  batchId: string,
  opts: QueryBatchEntriesOptions
): { whereClause: string; params: unknown[] } => {
  const conditions = ['batch_id = ?'];
  const params: unknown[] = [batchId];

  if (opts.type) {
    conditions.push('type = ?');
    params.push(opts.type);
  }

  const excludeTypes = opts.excludeTypes ?? [];
  if (excludeTypes.length > 0) {
    const placeholders = excludeTypes.map(() => '?').join(', ');
    conditions.push(`type NOT IN (${placeholders})`);
    params.push(...excludeTypes);
  }

  return { whereClause: `WHERE ${conditions.join(' AND ')}`, params };
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
const createStorage = (db: IDatabase): ITraceStorage => {
  const writeEntry = async (entry: ITraceEntry): Promise<void> => {
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
    patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
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
  ): Promise<{ data: ITraceEntry[]; total: number }> => {
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
      data: rows.map((row) => rowToEntry(row, tagsByUuid.get(row.uuid) ?? [], opts.summary)),
      total,
    };
  };

  const getEntry = async (uuid: string): Promise<ITraceEntry | null> => {
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

  const getBatch = async (batchId: string): Promise<ITraceEntry[]> => {
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

  const queryBatchEntries = async (
    batchId: string,
    opts: QueryBatchEntriesOptions = {}
  ): Promise<QueryBatchEntriesResult> => {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 10;
    const offset = (page - 1) * perPage;
    const counts = await buildBatchCounts(db, batchId);

    if (opts.countsOnly) {
      const total = Object.values(counts).reduce((sum, value) => sum + Number(value ?? 0), 0);
      return { entries: [], total, counts, page, perPage };
    }

    const { whereClause, params } = buildBatchEntryFilters(batchId, opts);
    const countResult = (await db.queryOne(
      `SELECT COUNT(*) as cnt FROM ${TABLE_ENTRIES} ${whereClause}`,
      params
    )) as { cnt: number } | undefined;
    const total = countResult?.cnt ?? 0;
    if (total === 0) {
      return { entries: [], total: 0, counts, page, perPage };
    }

    const rows = (await db.query(
      `SELECT id, uuid, batch_id, family_hash, type, content, is_latest, created_at
       FROM ${TABLE_ENTRIES}
       ${whereClause}
       ORDER BY created_at ASC, id ASC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    )) as EntryRow[];

    const tagsByUuid = await loadTagsByUuid(
      db,
      rows.map((row) => row.uuid)
    );

    return {
      entries: rows.map((row) => rowToEntry(row, tagsByUuid.get(row.uuid) ?? [], opts.summary)),
      total,
      counts,
      page,
      perPage,
    };
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
    await db.execute(buildIgnoreInsert(db, TABLE_MONITORING, ['tag'], ['tag']), [tag]);
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
    queryBatchEntries,
    prune,
    clear,
    getMonitoring,
    addMonitoring,
    removeMonitoring,
    stats,
  };
};

const resolveStorage = (db: IDatabase): ITraceStorage => {
  return createStorage(db);
};

const reset = (): void => {
  return;
};

export const TraceStorage = Object.freeze({ resolveStorage, reset, familyHash });

export { type ITraceStorage } from '../types';
