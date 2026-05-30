declare module 'bullmq/dist/cjs/scripts/index.js' {
  export type BullMQScriptDefinition = Readonly<{
    name: string;
    keys: number;
    content: string;
  }>;

  export const addDelayedJob: BullMQScriptDefinition;
  export const addJobScheduler: BullMQScriptDefinition;
  export const addLog: BullMQScriptDefinition;
  export const addParentJob: BullMQScriptDefinition;
  export const addPrioritizedJob: BullMQScriptDefinition;
  export const addRepeatableJob: BullMQScriptDefinition;
  export const addStandardJob: BullMQScriptDefinition;
  export const changeDelay: BullMQScriptDefinition;
  export const changePriority: BullMQScriptDefinition;
  export const cleanJobsInSet: BullMQScriptDefinition;
  export const drain: BullMQScriptDefinition;
  export const extendLock: BullMQScriptDefinition;
  export const extendLocks: BullMQScriptDefinition;
  export const getCounts: BullMQScriptDefinition;
  export const getCountsPerPriority: BullMQScriptDefinition;
  export const getDependencyCounts: BullMQScriptDefinition;
  export const getJobScheduler: BullMQScriptDefinition;
  export const getMetrics: BullMQScriptDefinition;
  export const getRanges: BullMQScriptDefinition;
  export const getRateLimitTtl: BullMQScriptDefinition;
  export const getState: BullMQScriptDefinition;
  export const getStateV2: BullMQScriptDefinition;
  export const isFinished: BullMQScriptDefinition;
  export const isJobInList: BullMQScriptDefinition;
  export const isMaxed: BullMQScriptDefinition;
  export const moveJobFromActiveToWait: BullMQScriptDefinition;
  export const moveJobsToWait: BullMQScriptDefinition;
  export const moveStalledJobsToWait: BullMQScriptDefinition;
  export const moveToActive: BullMQScriptDefinition;
  export const moveToDelayed: BullMQScriptDefinition;
  export const moveToFinished: BullMQScriptDefinition;
  export const moveToWaitingChildren: BullMQScriptDefinition;
  export const obliterate: BullMQScriptDefinition;
  export const paginate: BullMQScriptDefinition;
  export const pause: BullMQScriptDefinition;
  export const promote: BullMQScriptDefinition;
  export const releaseLock: BullMQScriptDefinition;
  export const removeChildDependency: BullMQScriptDefinition;
  export const removeDeduplicationKey: BullMQScriptDefinition;
  export const removeJob: BullMQScriptDefinition;
  export const removeJobScheduler: BullMQScriptDefinition;
  export const removeOrphanedJobs: BullMQScriptDefinition;
  export const removeRepeatable: BullMQScriptDefinition;
  export const removeUnprocessedChildren: BullMQScriptDefinition;
  export const reprocessJob: BullMQScriptDefinition;
  export const retryJob: BullMQScriptDefinition;
  export const saveStacktrace: BullMQScriptDefinition;
  export const updateData: BullMQScriptDefinition;
  export const updateJobScheduler: BullMQScriptDefinition;
  export const updateProgress: BullMQScriptDefinition;
  export const updateRepeatableJobMillis: BullMQScriptDefinition;
}

declare module 'bullmq/dist/cjs/version.js' {
  export const version: string;
}
