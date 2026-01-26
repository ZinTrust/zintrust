/**
 * Queue Types for Advanced Queue Patterns
 * Defines all interfaces and types for deduplication and lock management
 */

export interface DeduplicationOptions {
  id: string;
  ttl?: number;
  dontRelease?: boolean;
  replace?: boolean;
  releaseAfter?: string | number | ReleaseCondition;
}

export interface ReleaseCondition {
  condition: string;
  delay?: number;
}

export interface LockOptions {
  ttl?: number;
  autoExtend?: boolean;
  retryDelay?: number;
}

export interface Lock {
  key: string;
  ttl: number;
  acquired: boolean;
  expires: Date;
}

export interface LockStatus {
  exists: boolean;
  ttl?: number;
  expires?: Date;
}

export interface LockProviderConfig {
  type: 'redis' | 'database' | 'memory';
  connection?: unknown;
  prefix?: string;
  defaultTtl?: number;
}

export interface QueueConfig {
  name: string;
  connection?: unknown;
  defaultDedupTtl?: number;
  lockProvider?: string;
}

export interface AdvancedJobOptions {
  uniqueId?: string;
  uniqueVia?: string;
  deduplication?: DeduplicationOptions;
}

export interface JobResult {
  id: string;
  deduplicated: boolean;
  lockId?: string;
  status: 'queued' | 'deduplicated' | 'failed';
}

export interface LockProvider {
  acquire(key: string, options: LockOptions): Promise<Lock>;
  release(lock: Lock): Promise<void>;
  extend(lock: Lock, ttl: number): Promise<boolean>;
  status(key: string): Promise<LockStatus>;
  list(pattern?: string): Promise<string[]>;
}
