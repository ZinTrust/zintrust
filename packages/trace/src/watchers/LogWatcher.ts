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

const shouldSkipTraceInfrastructureLog = (message: string): boolean => {
  return TRACE_INFRASTRUCTURE_LOG_MESSAGES.has(message.trim());
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
        if (RequestFilter.shouldIgnoreCurrentRequest(config.ignoreRoutes)) return;
        if (shouldSkipTraceInfrastructureLog(message)) return;

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
