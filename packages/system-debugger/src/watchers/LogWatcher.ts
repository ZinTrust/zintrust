/**
 * LogWatcher — captures Logger output via Logger.addSink().
 */
import { Logger } from '@zintrust/core';
import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, LogContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { RequestFilter } from '../utils/requestFilter';

type LoggerSink = (level: string, message: string, context?: Record<string, unknown>) => void;

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export const LogWatcher: IDebuggerWatcher = Object.freeze({
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.log === false) return () => undefined;

    const minPriority = LEVEL_PRIORITY[config.logMinLevel] ?? 1;

    const loggerWithSink = Logger as typeof Logger & {
      addSink?: (fn: LoggerSink) => () => void;
    };

    if (typeof loggerWithSink.addSink !== 'function') {
      return () => undefined;
    }

    const unsubscribe = loggerWithSink.addSink((level, message, context) => {
      if ((LEVEL_PRIORITY[level] ?? 0) < minPriority) return;
      if (RequestFilter.shouldIgnoreCurrentRequest(config.ignoreRoutes)) return;

      const content: LogContent = {
        level,
        message,
        context: context ?? undefined,
        hostname: DebuggerContext.getHostname(),
      };

      storage
        .writeEntry({
          uuid: crypto.randomUUID(),
          batchId: DebuggerContext.getBatchId(),
          type: EntryType.LOG,
          content,
          tags: AuthTag.append([]),
          isLatest: true,
          createdAt: DebuggerContext.now(),
        })
        .catch(() => undefined);
    });

    return unsubscribe;
  },
});
