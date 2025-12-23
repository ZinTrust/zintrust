/**
 * Profiling Type Definitions
 * Shared interfaces for query logging, N+1 detection, and memory profiling
 */

export const PROFILING_TYPES_MODULE = Object.freeze('ProfilingTypes');

/**
 * Log entry for a single database query execution
 */
export interface QueryLogEntry {
  sql: string;
  params: unknown[];
  duration: number;
  timestamp: Date;
  context: string;
  executionCount?: number;
}

/**
 * Detected N+1 query pattern
 */
export interface N1Pattern {
  table: string;
  queryCount: number;
  query: string;
  severity: 'warning' | 'critical';
}

/**
 * Memory snapshot at a point in time
 */
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: Date;
}

/**
 * Memory delta between two snapshots
 */
export interface MemoryDelta {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * N1Detector analyzes query logs to identify N+1 patterns
 * Groups identical queries and flags those executed 5+ times as critical
 */
export interface IN1Detector {
  /**
   * Extract table name from SQL query
   */
  extractTableFromSQL(sql: string): string;

  /**
   * Detect N+1 patterns in query log
   */
  detect(queryLog: QueryLogEntry[]): N1Pattern[];

  /**
   * Get severity level based on repetition count
   */
  getSeverity(count: number): 'warning' | 'critical';

  /**
   * Generate human-readable summary of N+1 patterns
   */
  generateSummary(patterns: N1Pattern[]): string;
}

/**
 * Complete profile report for a request
 */
export interface ProfileReport {
  duration: number;
  queriesExecuted: number;
  n1Patterns: N1Pattern[];
  memoryDelta: MemoryDelta;
  timestamp: Date;
}
