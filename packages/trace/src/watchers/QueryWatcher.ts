/**
 * QueryWatcher — hooks into Database.onAfterQuery to record SQL entries.
 */
import { TraceContext } from '../context';
import { TraceStorage } from '../storage';
import type { ITraceWatcher, ITraceWatcherConfig, QueryContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { RequestFilter } from '../utils/requestFilter';

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
  return normalized.includes('zin_trace_entries') || normalized.includes('zin_trace_monitoring');
};

export const QueryWatcher: ITraceWatcher = Object.freeze({
  register({ storage, config, db: injectedDb }: ITraceWatcherConfig): () => void {
    if (config.watchers.query === false) return () => undefined;
    if (!injectedDb) return () => undefined; // no db available

    const db = injectedDb;

    const handler = (query: string, params: unknown[], duration: number): void => {
      if (RequestFilter.shouldIgnoreCurrentRequest(config.ignoreRoutes)) return;
      if (isTraceStorageQuery(query)) return;

      const batchId = TraceContext.getBatchId();
      const sql = bindingsInterpolated(query, params);
      const roundedDuration = Math.round(duration * 100) / 100;
      const hash = TraceStorage.familyHash(query);
      const slow = roundedDuration >= config.slowQueryThreshold;

      const content: QueryContent = {
        connection: 'default',
        sql,
        time: roundedDuration,
        duration: roundedDuration,
        slow,
        hash,
        hostname: TraceContext.getHostname(),
      };

      const tags = AuthTag.append([]);
      if (slow) tags.push('slow');

      storage
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
    };

    (
      db as {
        onAfterQuery?: (h: (sql: string, params: unknown[], duration: number) => void) => void;
      }
    ).onAfterQuery?.(handler);

    return () => {
      (
        db as {
          offAfterQuery?: (h: (sql: string, params: unknown[], duration: number) => void) => void;
        }
      ).offAfterQuery?.(handler);
    };
  },
});
