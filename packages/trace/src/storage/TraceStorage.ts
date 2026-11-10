/**
 * TraceStorage — sealed namespace wrapping the D1/SQLite driver.
 * Resolves the correct IDatabase from the app config, then delegates all
 * read/write operations to the trace storage facade.
 */
import type { IDatabase } from '@zintrust/core/database';
import { Logger } from '@zintrust/core/logger';
import type {
  EntryTypeValue,
  ITraceEntry,
  ITraceStorage,
  QueryBatchEntriesOptions,
  QueryBatchEntriesResult,
  QueryEntriesOptions,
  TraceClientHost,
  TraceSearchField,
  TraceSearchOptions,
} from '../types';
import { EntryType } from '../types';
import { familyHash } from '../utils/familyHash';
import { HOST_TAG_PREFIX } from '../utils/hostTag';

const TABLE_ENTRIES = 'zin_trace_entries';
const TABLE_TAGS = 'zin_trace_entries_tags';
const TABLE_MONITORING = 'zin_trace_monitoring';
const CLIENT_HOSTS_LIMIT = 500;

const generateUuid = (): string => crypto.randomUUID();

type EntryRow = {
  id: number;
  uuid: string;
  batch_id: string;
  family_hash: string | null;
  type: string;
  content: string | null;
  summary?: string | null;
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

const compactContentFor = (type: string, content: string): Record<string, unknown> | undefined => {
  if (type === 'request') return compactRequestContent(content);
  if (type === 'client_request') return compactClientRequestContent(content);
  return undefined;
};

// Computed on write so list queries can read a small column instead of the full payload.
// Null when nothing can be compacted; list reads then fall back to the content column.
const buildListSummary = (type: string, content: string): string | null => {
  const compact = compactContentFor(type, content);
  return compact ? JSON.stringify(compact) : null;
};

const summarizeEntryContent = (row: EntryRow): unknown => {
  const content = row.content ?? 'null';
  return compactContentFor(row.type, content) ?? (JSON.parse(content) as unknown);
};

type DatabaseWithDriver = IDatabase & {
  getType?: () => string;
};

const driverOf = (db: IDatabase): string => (db as DatabaseWithDriver).getType?.() ?? 'sqlite';

const isSqliteFamilyDriver = (driver: string): boolean =>
  driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';

// Top-level JSON keys that hold each search field group's values across entry types.
const SEARCH_FIELD_KEYS: Record<TraceSearchField, readonly string[]> = {
  request: ['payload', 'requestBody'],
  response: ['responseBody', 'responseStatus'],
  headers: ['headers', 'requestHeaders', 'responseHeaders'],
  url: ['uri', 'url'],
  error: ['error', 'message'],
  sql: ['sql'],
  meta: ['method', 'hostname', 'userId', 'name', 'key', 'model', 'subject', 'command'],
};

const LIKE_ESCAPE = '!';

const escapeLikeTerm = (term: string): string =>
  term.replace(/[!%_]/g, (ch) => `${LIKE_ESCAPE}${ch}`);

// JSON keys come from SEARCH_FIELD_KEYS (fixed identifiers, never user input), so inlining them is safe.
const jsonValueExpr = (driver: string, column: string, key: string): string => {
  if (driver === 'mysql') return `JSON_UNQUOTE(JSON_EXTRACT(${column}, '$.${key}'))`;
  if (driver === 'postgresql') return `(${column}::jsonb ->> '${key}')`;
  if (driver === 'sqlserver') {
    return `COALESCE(JSON_VALUE(${column}, '$.${key}'), JSON_QUERY(${column}, '$.${key}'))`;
  }
  return `json_extract(${column}, '$.${key}')`;
};

// Trigram FTS5 index from migration 20261109120000 (sqlite-family only). Trigram cannot match terms
// shorter than 3 characters, and group values are newline-joined, so terms with a newline use LIKE.
const FTS_TABLE = 'zin_trace_entries_search';
const FTS_ALL_COLUMN = 'all_content';
const FTS_MIN_TERM_CHARS = 3;

const canUseFtsSearch = (driver: string, term: string): boolean =>
  isSqliteFamilyDriver(driver) &&
  Array.from(term).length >= FTS_MIN_TERM_CHARS &&
  !/[\r\n]/.test(term);

// FTS5 column filter: `{col1 col2} : "phrase"`, with embedded double quotes doubled.
const buildFtsCondition = (
  idColumn: string,
  term: string,
  fields: TraceSearchField[]
): { sql: string; params: unknown[] } => {
  const columns = fields.length === 0 ? [FTS_ALL_COLUMN] : [...new Set(fields)];
  const phrase = `"${term.replaceAll('"', '""')}"`;

  return {
    sql: `${idColumn} IN (SELECT rowid FROM ${FTS_TABLE} WHERE ${FTS_TABLE} MATCH ?)`,
    params: [`{${columns.join(' ')}} : ${phrase}`],
  };
};

const buildSearchCondition = (
  driver: string,
  refs: { id: string; column: string },
  opts: TraceSearchOptions,
  allowFts = true
): { sql: string; params: unknown[] } | undefined => {
  const term = opts.search?.trim();
  if (!term) return undefined;

  const fields = opts.searchFields ?? [];
  if (allowFts && canUseFtsSearch(driver, term)) return buildFtsCondition(refs.id, term, fields);

  const column = refs.column;
  const pattern = `%${escapeLikeTerm(term)}%`;
  const op = driver === 'postgresql' ? 'ILIKE' : 'LIKE';
  const keys = [...new Set(fields.flatMap((field) => SEARCH_FIELD_KEYS[field]))];

  if (keys.length === 0) {
    return { sql: `${column} ${op} ? ESCAPE '${LIKE_ESCAPE}'`, params: [pattern] };
  }

  const clauses = keys.map(
    (key) => `${jsonValueExpr(driver, column, key)} ${op} ? ESCAPE '${LIKE_ESCAPE}'`
  );
  return { sql: `(${clauses.join(' OR ')})`, params: keys.map(() => pattern) };
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

const summarizeEntryRow = (row: EntryRow): unknown =>
  typeof row.summary === 'string'
    ? (JSON.parse(row.summary) as unknown)
    : summarizeEntryContent(row);

const rowToEntry = (row: EntryRow, tags: string[], summary = false): ITraceEntry => ({
  uuid: row.uuid,
  batchId: row.batch_id,
  familyHash: row.family_hash ?? undefined,
  type: row.type as EntryTypeValue,
  content: summary ? summarizeEntryRow(row) : (JSON.parse(row.content ?? 'null') as unknown),
  tags,
  isLatest: Boolean(row.is_latest),
  createdAt: row.created_at,
});

// Summary mode selects the precomputed summary and loads full content only for rows without one.
const entryListColumns = (summary: boolean, prefix: '' | 'e.'): string => {
  const base = `${prefix}id, ${prefix}uuid, ${prefix}batch_id, ${prefix}family_hash, ${prefix}type`;
  const tail = `${prefix}is_latest, ${prefix}created_at`;
  if (!summary) return `${base}, ${prefix}content, ${tail}`;

  return `${base}, ${prefix}summary, CASE WHEN ${prefix}summary IS NULL THEN ${prefix}content END AS content, ${tail}`;
};

const insertTags = async (db: IDatabase, uuid: string, tags: string[]): Promise<void> => {
  if (tags.length === 0) return;

  const sql = buildIgnoreInsert(db, TABLE_TAGS, ['entry_uuid', 'tag'], ['entry_uuid', 'tag']);

  await Promise.all(
    tags.map(async (tag) => {
      await db.execute(sql, [uuid, tag]);
    })
  );
};

// Totals and overview stats are cached briefly so repeated dashboard loads skip the GROUP BY and
// COUNT scans. Page rows are never cached so new entries show up on the list immediately.
const TOTALS_CACHE_TTL_MS = 5_000;
const TOTALS_CACHE_MAX_ENTRIES = 200;

const createTtlCache = (
  ttlMs: number,
  maxEntries: number
): {
  getOrLoad: <T>(
    key: string,
    load: () => Promise<T>,
    shouldCache?: (value: T) => boolean
  ) => Promise<T>;
} => {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();

  const getOrLoad = async <T>(
    key: string,
    load: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true
  ): Promise<T> => {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const value = await load();
    if (!shouldCache(value)) return value;

    entries.delete(key);
    if (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    if (value !== 0) entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  };

  return Object.freeze({ getOrLoad });
};

// Shared by the count and page queries. The tag condition is supplied by the caller because
// the count joins the tags table while the page query uses EXISTS (see queryEntries).
const buildEntryConditions = (
  opts: QueryEntriesOptions,
  driver: string,
  allowFts = true
): { conditions: string[]; params: unknown[] } => {
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

  const search = buildSearchCondition(driver, { id: 'e.id', column: 'e.content' }, opts, allowFts);
  if (search) {
    conditions.push(search.sql);
    params.push(...search.params);
  }

  return { conditions, params };
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
  opts: QueryBatchEntriesOptions,
  driver: string
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

  const search = buildSearchCondition(driver, { id: 'id', column: 'content' }, opts);
  if (search) {
    conditions.push(search.sql);
    params.push(...search.params);
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
  const totalsCache = createTtlCache(TOTALS_CACHE_TTL_MS, TOTALS_CACHE_MAX_ENTRIES);

  const writeEntry = async (entry: ITraceEntry): Promise<void> => {
    const uuid = entry.uuid || generateUuid();
    const content = JSON.stringify(entry.content);
    await db.execute(
      `INSERT INTO ${TABLE_ENTRIES} (uuid, batch_id, family_hash, type, content, summary, is_latest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        entry.batchId,
        entry.familyHash ?? null,
        entry.type,
        content,
        buildListSummary(entry.type, content),
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
      sets.push('content = ?', 'summary = NULL');
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

  const runQueryEntries = async (
    opts: QueryEntriesOptions,
    allowFts: boolean
  ): Promise<{ data: ITraceEntry[]; total: number }> => {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 50;
    const offset = (page - 1) * perPage;
    const { conditions, params } = buildEntryConditions(opts, driverOf(db), allowFts);
    const where = (extra: string[]): string => {
      const all = [...extra, ...conditions];
      return all.length > 0 ? `WHERE ${all.join(' AND ')}` : '';
    };
    const tagParams = opts.tag ? [opts.tag] : [];

    // Tag count joins the tags index, so an absent tag costs almost nothing.
    const total = await totalsCache.getOrLoad(
      `count:${JSON.stringify({ tag: opts.tag ?? null, conditions, params })}`,
      async () => {
        const countResult = (await db.queryOne(
          opts.tag
            ? `SELECT COUNT(*) as cnt FROM ${TABLE_TAGS} t
               INNER JOIN ${TABLE_ENTRIES} e ON e.uuid = t.entry_uuid
               ${where(['t.tag = ?'])}`
            : `SELECT COUNT(*) as cnt FROM ${TABLE_ENTRIES} e ${where([])}`,
          [...tagParams, ...params]
        )) as { cnt: number } | undefined;
        return countResult?.cnt ?? 0;
      },
      (count) => count > 0
    );
    if (total === 0) return { data: [], total };

    // EXISTS (not JOIN) so the newest-first created_at walk can stop at LIMIT instead of
    // sorting every tagged row.
    const rows = (await db.query(
      `SELECT ${entryListColumns(Boolean(opts.summary), 'e.')}
       FROM ${TABLE_ENTRIES} e
       ${where(opts.tag ? [`EXISTS (SELECT 1 FROM ${TABLE_TAGS} t WHERE t.entry_uuid = e.uuid AND t.tag = ?)`] : [])}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [...tagParams, ...params, perPage, offset]
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

    const { whereClause, params } = buildBatchEntryFilters(batchId, opts, driverOf(db));
    const countResult = (await db.queryOne(
      `SELECT COUNT(*) as cnt FROM ${TABLE_ENTRIES} ${whereClause}`,
      params
    )) as { cnt: number } | undefined;
    const total = countResult?.cnt ?? 0;
    if (total === 0) {
      return { entries: [], total: 0, counts, page, perPage };
    }

    const rows = (await db.query(
      `SELECT ${entryListColumns(Boolean(opts.summary), '')}
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

  const queryEntries = async (
    opts: QueryEntriesOptions
  ): Promise<{ data: ITraceEntry[]; total: number }> => {
    try {
      return await runQueryEntries(opts, true);
    } catch (error) {
      if (!canUseFtsSearch(driverOf(db), (opts.search ?? '').trim())) throw error;
      // The FTS index can be missing or unusable on a D1 database; the LIKE scan still answers the search.
      Logger.warn('[trace] FTS search failed; retrying with LIKE scan', {
        error: error instanceof Error ? error.message : String(error),
      });
      return runQueryEntries(opts, false);
    }
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

  const stats = async (): Promise<Record<EntryTypeValue, number>> =>
    totalsCache.getOrLoad('stats', async () => {
      const rows = (await db.query(
        `SELECT type, COUNT(*) as cnt FROM ${TABLE_ENTRIES} GROUP BY type`,
        []
      )) as Array<{ type: string; cnt: number }>;
      const output: Record<string, number> = {};
      for (const row of rows) {
        output[row.type] = row.cnt;
      }
      return output as Record<EntryTypeValue, number>;
    });

  const getClientHosts = async (): Promise<TraceClientHost[]> => {
    const rows = (await db.query(
      `SELECT t.tag AS tag, COUNT(*) AS cnt FROM ${TABLE_TAGS} t ` +
        `INNER JOIN ${TABLE_ENTRIES} e ON e.uuid = t.entry_uuid ` +
        `WHERE e.type = ? AND t.tag LIKE ? ` +
        `GROUP BY t.tag ORDER BY cnt DESC LIMIT ${CLIENT_HOSTS_LIMIT}`,
      [EntryType.CLIENT_REQUEST, `${HOST_TAG_PREFIX}%`]
    )) as Array<{ tag: string; cnt: number }>;
    return rows.map((row) => ({
      host: row.tag.slice(HOST_TAG_PREFIX.length),
      count: Number(row.cnt),
    }));
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
    getClientHosts,
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
