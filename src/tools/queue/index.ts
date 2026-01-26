/**
 * Queue Module Exports
 * Centralized exports for advanced queue patterns
 */

export { createAdvancedQueue, type AdvancedQueue } from '@queue/AdvancedQueue';
export { createDeduplicationBuilder, type DeduplicationBuilder } from '@queue/DeduplicationBuilder';
export {
  createLockProvider,
  createMemoryLockProvider,
  createRedisLockProvider,
  getLockProvider,
  registerLockProvider,
} from '@queue/LockProvider';

// Re-export types
export type {
  AdvancedJobOptions,
  DeduplicationOptions,
  JobResult,
  Lock,
  LockOptions,
  LockProvider,
  LockProviderConfig,
  LockStatus,
  QueueConfig,
  ReleaseCondition,
} from '@/types/Queue';
