/**
 * N+1 Query Pattern Detector
 * Analyzes query logs to identify N+1 patterns
 */

import { IN1Detector, N1Pattern, QueryLogEntry } from '@profiling/types';

/**\n * N1Detector analyzes query logs to identify N+1 patterns
 * Groups identical queries and flags those executed 5+ times as critical
 * Sealed namespace for immutability
 */
export const N1Detector = Object.freeze({
  /**
   * Create a new N1Detector instance
   */
  create(): IN1Detector {
    return {
      /**
       * Extract table name from SQL query
       * Handles SELECT, INSERT, UPDATE, DELETE statements
       */
      extractTableFromSQL(sql: string): string {
        return extractTableFromSQL(sql);
      },

      /**
       * Detect N+1 patterns in query log
       * Groups identical queries and returns those executed 5+ times as patterns
       */
      detect(queryLog: QueryLogEntry[]): N1Pattern[] {
        return detectN1Patterns(queryLog);
      },

      /**
       * Get severity level based on repetition count
       */
      getSeverity(count: number): 'warning' | 'critical' {
        return getSeverity(count);
      },

      /**
       * Generate human-readable summary of N+1 patterns
       */
      generateSummary(patterns: N1Pattern[]): string {
        return generateSummary(patterns);
      },
    };
  },
});

/**
 * Extract table name from SQL query
 */
function extractTableFromSQL(sql: string): string {
  // Remove excess whitespace and normalize
  const normalized = sql.trim().replaceAll(/\s+/g, ' ');

  // INSERT INTO table
  let match = new RegExp(/INSERT\s+INTO\s+`?(\w+)`?/i).exec(normalized);
  if (match) return match[1];

  // UPDATE table
  match = new RegExp(/UPDATE\s+`?(\w+)`?/i).exec(normalized);
  if (match) return match[1];

  // DELETE FROM table
  match = new RegExp(/DELETE\s+FROM\s+`?(\w+)`?/i).exec(normalized);
  if (match) return match[1];

  // SELECT ... FROM table
  match = new RegExp(/FROM\s+`?(\w+)`?/i).exec(normalized);
  if (match) return match[1];

  return 'unknown';
}

/**
 * Detect N+1 patterns in query log
 */
function detectN1Patterns(queryLog: QueryLogEntry[]): N1Pattern[] {
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
      const severity = getSeverity(count);
      const table = extractTableFromSQL(sql);

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
function getSeverity(count: number): 'warning' | 'critical' {
  return count >= 10 ? 'critical' : 'warning';
}

/**
 * Generate human-readable summary of N+1 patterns
 */
function generateSummary(patterns: N1Pattern[]): string {
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
