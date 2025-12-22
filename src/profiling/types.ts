/**
 * Profiling Type Definitions
 * Shared interfaces for query logging, N+1 detection, and memory profiling
 */

export const PROFILING_TYPES_MODULE = 'ProfilingTypes';

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
 * Complete profile report for a request
 */
export interface ProfileReport {
  duration: number;
  queriesExecuted: number;
  n1Patterns: N1Pattern[];
  memoryDelta: MemoryDelta;
  timestamp: Date;
}
