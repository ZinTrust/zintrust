/**
 * N+1 Query Pattern Detector
 * Analyzes query logs to identify N+1 patterns
 */

import { N1Pattern, QueryLogEntry } from '@profiling/types';

/**
 * N1Detector analyzes query logs to identify N+1 patterns
 * Groups identical queries and flags those executed 5+ times as critical
 */
export class N1Detector {
  /**
   * Extract table name from SQL query
   * Handles SELECT, INSERT, UPDATE, DELETE statements
   */
  public extractTableFromSQL(sql: string): string {
    // Remove excess whitespace and normalize
    const normalized = sql.trim().replaceAll(/\s+/g, ' ');

    // SELECT ... FROM table
    let match = new RegExp(/FROM\s+`?(\w+)`?/i).exec(normalized);
    if (match) return match[1];

    // INSERT INTO table
    match = new RegExp(/INSERT\s+INTO\s+`?(\w+)`?/i).exec(normalized);
    if (match) return match[1];

    // UPDATE table
    match = new RegExp(/UPDATE\s+`?(\w+)`?/i).exec(normalized);
    if (match) return match[1];

    // DELETE FROM table
    match = new RegExp(/DELETE\s+FROM\s+`?(\w+)`?/i).exec(normalized);
    if (match) return match[1];

    return 'unknown';
  }

  /**
   * Detect N+1 patterns in query log
   * Groups identical queries and returns those executed 5+ times as patterns
   */
  public detect(queryLog: QueryLogEntry[]): N1Pattern[] {
    if (queryLog.length === 0) {
      return [];
    }

    // Group queries by SQL
    const queryGroups = new Map<string, QueryLogEntry[]>();

    for (const entry of queryLog) {
      if (!queryGroups.has(entry.sql)) {
        queryGroups.set(entry.sql, []);
      }
      queryGroups.get(entry.sql)?.push(entry);
    }

    // Find patterns with 5+ executions
    const patterns: N1Pattern[] = [];

    for (const [sql, entries] of queryGroups) {
      const count = entries.length;

      if (count >= 5) {
        const severity = count >= 10 ? 'critical' : 'warning';
        const table = this.extractTableFromSQL(sql);

        patterns.push({
          table,
          queryCount: count,
          query: sql,
          severity,
        });
      }
    }

    // Sort by query count descending
    patterns.sort((a, b) => b.queryCount - a.queryCount);

    return patterns;
  }

  /**
   * Get severity level based on repetition count
   */
  public getSeverity(count: number): 'warning' | 'critical' {
    return count >= 10 ? 'critical' : 'warning';
  }

  /**
   * Generate human-readable summary of N+1 patterns
   */
  public generateSummary(patterns: N1Pattern[]): string {
    if (patterns.length === 0) {
      return 'No N+1 patterns detected';
    }

    const lines: string[] = ['N+1 Query Patterns Detected:'];

    for (const pattern of patterns) {
      lines.push(
        `  [${pattern.severity.toUpperCase()}] Table "${pattern.table}": ${pattern.queryCount} identical queries`
      );
    }

    return lines.join('\n');
  }
}
