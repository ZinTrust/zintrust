/**
 * Query Logger
 * Tracks database query execution with parameters, duration, and context
 */

import { QueryLogEntry } from '@profiling/types';

let instance: QueryLoggerInstance | undefined;

export interface QueryLoggerInstance {
  setContext(context: string): void;
  getContext(): string;
  logQuery(sql: string, params: unknown[], duration: number, context?: string): void;
  getQueryLog(context?: string): QueryLogEntry[];
  getQuerySummary(context?: string): Map<string, QueryLogEntry & { executionCount: number }>;
  getN1Suspects(context?: string, threshold?: number): QueryLogEntry[];
  clear(context?: string): void;
  getAllLogs(): Map<string, QueryLogEntry[]>;
  getQueryCount(context?: string): number;
  getTotalDuration(context?: string): number;
}

class QueryLoggerImpl implements QueryLoggerInstance {
  private readonly logs: Map<string, QueryLogEntry[]> = new Map();
  private currentContext: string = 'default';

  /**
   * Set the current execution context (e.g., request ID)
   */
  public setContext(context: string): void {
    this.currentContext = context;
    if (!this.logs.has(context)) {
      this.logs.set(context, []);
    }
  }

  /**
   * Get current context
   */
  public getContext(): string {
    return this.currentContext;
  }

  /**
   * Log a query execution
   */
  public logQuery(
    sql: string,
    params: unknown[],
    duration: number,
    context: string = this.currentContext
  ): void {
    if (!this.logs.has(context)) {
      this.logs.set(context, []);
    }

    const entry: QueryLogEntry = {
      sql,
      params,
      duration,
      timestamp: new Date(),
      context,
    };

    const contextLogs = this.logs.get(context);
    if (contextLogs !== undefined) {
      contextLogs.push(entry);
    }
  }

  /**
   * Get all logged queries for a context
   */
  public getQueryLog(context: string = this.currentContext): QueryLogEntry[] {
    return this.logs.get(context) ?? [];
  }

  /**
   * Get query summary with execution counts
   */
  public getQuerySummary(
    context: string = this.currentContext
  ): Map<string, QueryLogEntry & { executionCount: number }> {
    const logs = this.getQueryLog(context);
    const summary = new Map<string, QueryLogEntry & { executionCount: number }>();

    for (const log of logs) {
      if (!summary.has(log.sql)) {
        summary.set(log.sql, { ...log, executionCount: 0 });
      }
      const entry = summary.get(log.sql);
      if (entry !== undefined) {
        entry.executionCount++;
      }
    }

    return summary;
  }

  /**
   * Get N+1 suspects (queries executed 5+ times in same context)
   * Simple heuristic: identical queries executed many times suggests N+1
   */
  public getN1Suspects(
    context: string = this.currentContext,
    threshold: number = 5
  ): QueryLogEntry[] {
    const summary = this.getQuerySummary(context);
    const suspects: QueryLogEntry[] = [];

    for (const [, entry] of summary) {
      if (entry.executionCount >= threshold) {
        suspects.push(entry);
      }
    }

    return suspects;
  }

  /**
   * Clear logs for a context
   */
  public clear(context?: string): void {
    if (context === undefined) {
      this.logs.clear();
      this.currentContext = 'default';
    } else {
      this.logs.delete(context);
    }
  }

  /**
   * Get all logs
   */
  public getAllLogs(): Map<string, QueryLogEntry[]> {
    return new Map(this.logs);
  }

  /**
   * Get total query count for a context
   */
  public getQueryCount(context: string = this.currentContext): number {
    return this.getQueryLog(context).length;
  }

  /**
   * Get total duration for all queries in a context
   */
  public getTotalDuration(context: string = this.currentContext): number {
    const logs = this.getQueryLog(context);
    return logs.reduce((total, log) => total + log.duration, 0);
  }
}

/**
 * QueryLogger tracks all database queries executed during a request context
 * Provides N+1 detection heuristic by flagging identical queries executed 5+ times
 */
export const QueryLogger = {
  getInstance(): QueryLoggerInstance {
    instance ??= new QueryLoggerImpl();
    return instance;
  },

  setContext(context: string): void {
    this.getInstance().setContext(context);
  },

  getContext(): string {
    return this.getInstance().getContext();
  },

  logQuery(sql: string, params: unknown[], duration: number, context?: string): void {
    this.getInstance().logQuery(sql, params, duration, context);
  },

  getQueryLog(context?: string): QueryLogEntry[] {
    return this.getInstance().getQueryLog(context);
  },

  getQuerySummary(context?: string): Map<string, QueryLogEntry & { executionCount: number }> {
    return this.getInstance().getQuerySummary(context);
  },

  getN1Suspects(context?: string, threshold?: number): QueryLogEntry[] {
    return this.getInstance().getN1Suspects(context, threshold);
  },

  clear(context?: string): void {
    this.getInstance().clear(context);
  },

  getAllLogs(): Map<string, QueryLogEntry[]> {
    return this.getInstance().getAllLogs();
  },

  getQueryCount(context?: string): number {
    return this.getInstance().getQueryCount(context);
  },

  getTotalDuration(context?: string): number {
    return this.getInstance().getTotalDuration(context);
  },
};
