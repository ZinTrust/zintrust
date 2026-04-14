/**
 * LogWatcher — captures Logger output via Logger.addSink().
 */
import { Logger } from '@zintrust/core';
import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, LogContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { RequestFilter } from '../utils/requestFilter';

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const TRACE_INFRASTRUCTURE_LOG_MESSAGES = new Set<string>([
  '[MySQLProxyAdapter] Proxy request failed',
  '[trace] Trace storage write degraded',
]);

const TRACE_STORAGE_TABLE_NAMES = [
  'zin_trace_entries',
  'zin_trace_entries_tags',
  'zin_trace_monitoring',
];

const isTraceStorageQuery = (sql: string): boolean => {
  const normalized = sql.toLowerCase();
  return TRACE_STORAGE_TABLE_NAMES.some((tableName) => normalized.includes(tableName));
};

const extractSqlFromLog = (
  message: string,
  context?: Record<string, unknown>
): string | undefined => {
  const contextSql = context?.['sql'];
  if (typeof contextSql === 'string') return contextSql;

  const trimmed = message.trim();
  const rawPrefix = 'Raw SQL Query executed:';
  if (trimmed.startsWith(rawPrefix)) {
    const sql = trimmed.slice(rawPrefix.length).trim();
    return sql === '' ? undefined : sql;
  }

  return undefined;
};

const isTraceStorageQueryLog = (message: string, context?: Record<string, unknown>): boolean => {
  const normalizedMessage = message.trim().toLowerCase();
  if (!normalizedMessage.includes('query executed')) return false;

  const sql = extractSqlFromLog(message, context);
  return typeof sql === 'string' && isTraceStorageQuery(sql);
};

const shouldSkipTraceInfrastructureLog = (
  message: string,
  context?: Record<string, unknown>
): boolean => {
  return (
    TRACE_INFRASTRUCTURE_LOG_MESSAGES.has(message.trim()) ||
    isTraceStorageQueryLog(message, context)
  );
};

export const LogWatcher: ITraceWatcher = Object.freeze({
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.log === false) return () => undefined;

    const minPriority = LEVEL_PRIORITY[config.logMinLevel] ?? 1;

    const loggerWithSink = Logger;

    if (typeof loggerWithSink.addSink !== 'function') {
      return () => undefined;
    }

    const unsubscribe = loggerWithSink.addSink(
      (level: string, message: string, context?: Record<string, unknown>) => {
        if ((LEVEL_PRIORITY[level] ?? 0) < minPriority) return;
        if (RequestFilter.shouldIgnoreCurrentRequest(config.ignoreRoutes, config.ignorePath))
          return;
        if (shouldSkipTraceInfrastructureLog(message, context)) return;

        const content: LogContent = {
          level,
          message,
          context: context ?? undefined,
          hostname: TraceContext.getHostname(),
        };

        storage
          .writeEntry({
            uuid: crypto.randomUUID(),
            batchId: TraceContext.getBatchId(),
            type: EntryType.LOG,
            content,
            tags: AuthTag.append([]),
            isLatest: true,
            createdAt: TraceContext.now(),
          })
          .catch(() => undefined);
      }
    );

    return unsubscribe;
  },
});
