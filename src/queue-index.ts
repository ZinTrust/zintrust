/**
 * Queue Exports
 * Provides queue utilities and types
 */

export { resolveDeduplicationLockKey } from '@queue/DeduplicationKey';
export { createLockProvider, getLockProvider, registerLockProvider } from '@queue/LockProvider';
export { Queue, resolveLockPrefix } from '@tools/queue/Queue';
export type { BullMQPayload, QueueMessage } from '@tools/queue/Queue';

export { JobHeartbeatStore } from '@queue/JobHeartbeatStore';
export { JobStateTracker } from '@queue/JobStateTracker';
export { TimeoutManager } from '@queue/TimeoutManager';
export {
  autoRegisterJobStateTrackerPersistenceFromEnv,
  createJobStateTrackerDbPersistence,
} from '@tools/queue/JobStateTrackerDbPersistence';
export { RedisKeys } from '@tools/redis/RedisKeyManager';
