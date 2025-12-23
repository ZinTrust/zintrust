/**
 * Query Logger
 * Tracks database query execution with parameters, duration, and context
 */

import { QueryLogEntry } from '@profiling/types';

/**
 * QueryLogger tracks all database queries executed during a request context
 * Provides N+1 detection heuristic by flagging identical queries executed 5+ times
 */
export type QueryLoggerInstance = IQueryLogger;

export interface IQueryLogger {
  /**
   * Set current request context ID
   */
  setContext(context: string): void;

  /**
   * Get current request context ID
   */
  getContext(): string;

  /**
   * Log a query execution
   */
  logQuery(sql: string, params: unknown[], duration: number, context?: string): void;

  /**
   * Get query log for a context
   */
  getQueryLog(context?: string): QueryLogEntry[];

  /**
   * Get query summary (grouped by SQL) for a context
   */
  getQuerySummary(context?: string): Map<string, QueryLogEntry & { executionCount: number }>;

  /**
   * Get N+1 suspects (queries executed 5+ times in same context)
   */
  getN1Suspects(context?: string, threshold?: number): QueryLogEntry[];

  /**
   * Clear logs for a context
   */
  clear(context?: string): void;

  /**
   * Get all logs
   */
  getAllLogs(): Map<string, QueryLogEntry[]>;

  /**
   * Get total query count for a context
   */
  getQueryCount(context?: string): number;

  /**
   * Get total duration for all queries in a context
   */
  getTotalDuration(context?: string): number;
}

// Private state (exposed on QueryLogger for targeted unit-test coverage)
const logs = new Map<string, QueryLogEntry[] | undefined>();
let currentContext = 'default';

/**
 * QueryLogger tracks all database queries executed during a request context
 * Provides N+1 detection heuristic by flagging identical queries executed 5+ times
 * Sealed namespace for immutability
 */
export const QueryLogger = Object.freeze({
  // Exposed for rare-branch tests that deliberately corrupt the map.
  logs,
  getInstance(): IQueryLogger {
    return this;
  },
  /**
   * Set current request context ID
   */
  setContext(context: string): void {
    currentContext = context;
    if (!logs.has(context)) {
      logs.set(context, []);
    }
  },

  /**
   * Get current request context ID
   */
  getContext(): string {
    return currentContext;
  },

  /**
   * Log a query execution
   */
  logQuery(
    sql: string,
    params: unknown[],
    duration: number,
    context: string = currentContext
  ): void {
    if (!logs.has(context)) {
      logs.set(context, []);
    }

    const entry: QueryLogEntry = {
      sql,
      params,
      duration,
      timestamp: new Date(),
      context,
    };

    const contextLogs = logs.get(context);
    if (Array.isArray(contextLogs)) {
      contextLogs.push(entry);
    }
  },

  /**
   * Get query log for a context
   */
  getQueryLog(context: string = currentContext): QueryLogEntry[] {
    const contextLogs = logs.get(context);
    return Array.isArray(contextLogs) ? contextLogs : [];
  },

  /**
   * Get query summary (grouped by SQL) for a context
   */
  getQuerySummary(
    context: string = currentContext
  ): Map<string, QueryLogEntry & { executionCount: number }> {
    const queryLogs = this.getQueryLog(context);
    const summary = new Map<string, QueryLogEntry & { executionCount: number }>();

    for (const log of queryLogs) {
      if (!summary.has(log.sql)) {
        summary.set(log.sql, { ...log, executionCount: 0 });
      }
      const entry = summary.get(log.sql);
      if (entry !== undefined) {
        entry.executionCount++;
      }
    }

    return summary;
  },

  /**
   * Get N+1 suspects (queries executed 5+ times in same context)
   * Simple heuristic: identical queries executed many times suggests N+1
   */
  getN1Suspects(context: string = currentContext, threshold: number = 5): QueryLogEntry[] {
    const summary = this.getQuerySummary(context);
    const suspects: QueryLogEntry[] = [];

    for (const [, entry] of summary) {
      if (entry.executionCount >= threshold) {
        suspects.push(entry);
      }
    }

    return suspects;
  },

  /**
   * Clear logs for a context
   */
  clear(context?: string): void {
    if (context === undefined) {
      logs.clear();
      currentContext = 'default';
    } else {
      logs.delete(context);
    }
  },

  /**
   * Get all logs
   */
  getAllLogs(): Map<string, QueryLogEntry[]> {
    const copy = new Map<string, QueryLogEntry[]>();
    for (const [key, value] of logs.entries()) {
      if (Array.isArray(value)) {
        copy.set(key, value);
      }
    }
    return copy;
  },

  /**
   * Get total query count for a context
   */
  getQueryCount(context: string = currentContext): number {
    return this.getQueryLog(context).length;
  },

  /**
   * Get total duration for all queries in a context
   */
  getTotalDuration(context: string = currentContext): number {
    const queryLogs = this.getQueryLog(context);
    return queryLogs.reduce((total, log) => total + log.duration, 0);
  },
});
