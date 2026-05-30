/**
 * QueryWatcher — hooks into Database.onAfterQuery to record SQL entries.
 */
import { TraceContext } from '../context';
import { TraceStorage } from '../storage';
import type { ITraceWatcher, ITraceWatcherConfig, QueryContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _config: ITraceWatcherConfig['config'] | null = null;
let _scheduleBackgroundTask: ((task: Promise<void>) => void) | null = null;

const bindingsInterpolated = (sql: string, params: unknown[]): string => {
  // Inline params for display only — safe, not for re-execution.
  let i = 0;
  return sql.replaceAll('?', () => {
    const val = params[i++];
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'string') return `'${val.replaceAll("'", "''")}'`;
    return String(val);
  });
};

const isTraceStorageQuery = (sql: string): boolean => {
  const normalized = sql.toLowerCase();
  return (
    normalized.includes('zin_trace_entries') ||
    normalized.includes('zin_trace_entries_tags') ||
    normalized.includes('zin_trace_monitoring')
  );
};

const emit = (query: string, params: unknown[], duration: number, connection = 'default'): void => {
  if (_storage === null || _config === null) return;
  if (isTraceStorageQuery(query)) return;

  const batchId = TraceContext.getBatchId();
  const includeBindings = _config.captureQueryBindings !== false;
  const sql = includeBindings ? bindingsInterpolated(query, params) : query;
  const roundedDuration = Math.round(duration * 100) / 100;
  const hash = TraceStorage.familyHash(query);
  const slow = roundedDuration >= _config.slowQueryThreshold;

  const content: QueryContent = {
    connection,
    sql,
    statement: query,
    ...(includeBindings ? { bindings: [...params] } : {}),
    bindingsIncluded: includeBindings,
    time: roundedDuration,
    duration: roundedDuration,
    slow,
    hash,
    hostname: TraceContext.getHostname(),
  };

  const tags = AuthTag.append([]);
  if (slow) tags.push('slow');

  const writePromise = _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId,
      familyHash: hash,
      type: EntryType.QUERY,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);

  // Use background task scheduler if available (Workers waitUntil support)
  if (_scheduleBackgroundTask) {
    _scheduleBackgroundTask(writePromise);
  }
  // Otherwise, the promise is already fire-and-forget with error suppression
};

export const QueryWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({
    storage,
    config,
    db: injectedDb,
    scheduleBackgroundTask,
  }: ITraceWatcherConfig): () => void {
    if (config.watchers.query === false) return () => undefined;
    if (!injectedDb) return () => undefined; // no db available

    _storage = storage;
    _config = config;
    _scheduleBackgroundTask = scheduleBackgroundTask ?? null;
    const db = injectedDb;

    const handler = (query: string, params: unknown[], duration: number): void => {
      emit(query, params, duration);
    };

    (
      db as {
        onAfterQuery?: (h: (sql: string, params: unknown[], duration: number) => void) => void;
      }
    ).onAfterQuery?.(handler);

    return () => {
      _storage = null;
      _config = null;
      _scheduleBackgroundTask = null;
      (
        db as {
          offAfterQuery?: (h: (sql: string, params: unknown[], duration: number) => void) => void;
        }
      ).offAfterQuery?.(handler);
    };
  },
});
