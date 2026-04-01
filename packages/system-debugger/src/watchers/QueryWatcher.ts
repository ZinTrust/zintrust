/**
 * QueryWatcher — hooks into Database.onAfterQuery to record SQL entries.
 */
import { DebuggerContext } from '../context';
import { DebuggerStorage } from '../storage';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, QueryContent } from '../types';
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

export const QueryWatcher: IDebuggerWatcher = Object.freeze({
  register({ storage, config, db: injectedDb }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.query === false) return () => undefined;
    if (!injectedDb) return () => undefined; // no db available

    const db = injectedDb;

    const handler = (query: string, params: unknown[], duration: number): void => {
      if (RequestFilter.shouldIgnoreCurrentRequest(config.ignoreRoutes)) return;

      const batchId = DebuggerContext.getBatchId();
      const sql = bindingsInterpolated(query, params);
      const roundedDuration = Math.round(duration * 100) / 100;
      const hash = DebuggerStorage.familyHash(query);
      const slow = roundedDuration >= config.slowQueryThreshold;

      const content: QueryContent = {
        connection: 'default',
        sql,
        time: roundedDuration,
        duration: roundedDuration,
        slow,
        hash,
        hostname: DebuggerContext.getHostname(),
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
          createdAt: DebuggerContext.now(),
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
