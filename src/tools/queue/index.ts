/**
 * Queue Module Exports
 * Centralized exports for advanced queue patterns
 */

export { createAdvancedQueue, type AdvancedQueue } from '@queue/AdvancedQueue';
export { createDeduplicationBuilder, type DeduplicationBuilder } from '@queue/DeduplicationBuilder';
export { IdempotencyManager } from '@queue/IdempotencyManager';
export { JobHeartbeatStore } from '@queue/JobHeartbeatStore';
export { JobReconciliationRunner } from '@queue/JobReconciliationRunner';
export { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
export {
  createLockProvider,
  createMemoryLockProvider,
  createRedisLockProvider,
  getLockProvider,
  registerLockProvider,
} from '@queue/LockProvider';
export { QueueDataRedactor } from '@queue/QueueDataRedactor';
export { QueueReliabilityMetrics } from '@queue/QueueReliabilityMetrics';
export { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
export { QueueTracing } from '@queue/QueueTracing';
export { StalledJobMonitor } from '@queue/StalledJobMonitor';
export { TimeoutManager } from '@queue/TimeoutManager';

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
